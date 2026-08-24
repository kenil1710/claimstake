/**
 * End-to-end suite for ClaimStake against a live GenLayer network.
 *
 * Covers every verdict path (TRUE / FALSE / INCONCLUSIVE), both non-verdict
 * exits (CANCELED / EXPIRED), the revert surface, the prompt-injection
 * defence, and a closing balance invariant that ties the contract's on-chain
 * balance to the sum of what each dispute should still be holding.
 *
 * ── Why the claim pages are fixtures, not real websites ─────────────────────
 * Every create and every resolve renders the claim URL in a real browser, and
 * resolve then asks a model to judge the claim against what it read. Pointed
 * at a live site, this suite would fail the day that site reworded a sentence,
 * and the failure would look like a contract bug. The four fixture pages are
 * fixed text under our control, so a verdict that changes means the CONTRACT
 * changed. They also carry facts the model has strong independent priors about
 * (gold is Au/79, not Ag/47), so the verdict does not rest on the page alone.
 *
 * ── Ordering is load-bearing, in three places ───────────────────────────────
 *  1. The EXPIRE dispute is seeded FIRST, at the 5-minute deadline floor, and
 *     collected last. Everything in between runs inside its window, so the
 *     suite spends no wall-clock time waiting on it.
 *  2. create_dispute enforces a 180s per-wallet cooldown, so no wallet creates
 *     twice. That is what the challenger1..6 pool is for.
 *  3. The balance invariant runs BEFORE withdraw_fees, then again after with
 *     the withdrawal subtracted. Checking only after would let a wrong fee
 *     split hide inside the withdrawal.
 *
 * Usage: node e2e.mjs [--network=studionet] [--address=0x..] [--keep-going]
 */
import { readFileSync } from "node:fs";
import { argOf, connect, fundOnStudio, returnedJson, sleep } from "./harness.mjs";

const deployed = JSON.parse(readFileSync(new URL("./.deployed.json", import.meta.url), "utf8"));
const address = argOf("address", deployed.address);
const KEEP_GOING = process.argv.includes("--keep-going");

const GEN = 10n ** 18n;
const STAKE = GEN / 10n; // 0.1 GEN a side — well inside [min 0.01, max 100]
const GIST = "https://gist.githubusercontent.com/kenil1710/e8adc0c6e3ce687b5590b096e23536e1/raw";

const PAGE_TRUE = `${GIST}/gold-true.txt`;
const PAGE_FALSE = `${GIST}/gold-false.txt`;
const PAGE_FORECAST = `${GIST}/gold-forecast.txt`;
const PAGE_INJECTION = `${GIST}/gold-injection.txt`;
// RFC 2606 reserves .invalid, so this can never resolve for anyone, ever. A
// 404 URL would be wrong here: the browser still renders GitHub's "404: Not
// Found" page as text, so `reachable` comes back TRUE and the test inverts.
const PAGE_DEAD = "https://claimstake-e2e-nothing-here.invalid/claim";

const CLAIM_TRUE = "Gold has the chemical symbol Au and atomic number 79.";
const CLAIM_FALSE = "Gold has the chemical symbol Ag and atomic number 47.";
const CLAIM_FORECAST =
  "Gold will trade above fifty thousand US dollars per troy ounce during the year 2099.";

// ── Reporting ───────────────────────────────────────────────────────────────
let passed = 0;
const failed = [];
/** Every wei this suite sent into a rejected payable call, summed as it goes. */
let refundedTotal = 0n;
const started = Date.now();
const clock = () => `${((Date.now() - started) / 1000).toFixed(0)}s`.padStart(5);

const ok = (label, detail = "") => {
  passed++;
  console.log(`  ${clock()} ✓ ${label}${detail ? `  ${detail}` : ""}`);
};
const bad = (label, detail = "") => {
  failed.push(`${label} — ${detail}`);
  console.log(`  ${clock()} ✗ ${label}  ${detail}`);
  if (!KEEP_GOING && failed.length >= 8) {
    console.log("\ntoo many failures, stopping early (pass --keep-going to override)");
    finish();
  }
};
const gen = (wei) => `${(Number(wei) / 1e18).toFixed(4)} GEN`;
const phase = (name) => console.log(`\n── ${name} ${"─".repeat(Math.max(0, 60 - name.length))}`);

const eq = (label, actual, expected) =>
  String(actual) === String(expected)
    ? ok(label, String(actual).length > 40 ? "" : `= ${actual}`)
    : bad(label, `expected ${expected}, got ${actual}`);

/** Assert a call reverted AND that it reverted for the expected reason. */
function mustRevert(label, out, fragment) {
  if (out.ok) return bad(label, `expected a revert, but the call SUCCEEDED (${out.status})`);
  if (!out.reverted) return bad(label, `did not revert cleanly: ${out.status}/${out.exec}`);
  const reason = out.revertReason || "(no reason recorded)";
  if (fragment && !reason.toLowerCase().includes(fragment.toLowerCase())) {
    return bad(label, `reverted on the wrong rule: want ~"${fragment}", got "${reason}"`);
  }
  ok(label, `reverted: "${reason.slice(0, 64)}"`);
}

/**
 * Assert a PAYABLE call rejected its input without reverting.
 *
 * The distinction is the whole point. A revert on a payable method keeps the
 * caller's stake — GenVM rolls back contract state but not the value that rode
 * in with the call. So create_dispute and defend_dispute answer bad input with
 * a SUCCESSFUL transaction that refunds and returns `{ok: false, reason}`.
 *
 * That means three things have to be true at once, and checking fewer than all
 * three would let the old bug back in unnoticed:
 *   1. the transaction succeeded (a revert here is the bug),
 *   2. the return value says ok: false with the right reason,
 *   3. the refund covers every wei that was sent.
 */
function mustReject(label, out, fragment, sent) {
  if (out.reverted) {
    return bad(label, `REVERTED instead of refunding — the sender's ${gen(sent)} is stranded`);
  }
  if (!out.ok) return bad(label, `did not settle cleanly: ${out.status}/${out.exec}`);
  const body = returnedJson(out);
  if (!body) return bad(label, `returned no JSON body: ${JSON.stringify(out.returned)?.slice(0, 80)}`);
  if (body.ok !== false) return bad(label, `expected ok:false, got ${JSON.stringify(body)}`);
  const reason = String(body.reason ?? "");
  if (fragment && !reason.toLowerCase().includes(fragment.toLowerCase())) {
    return bad(label, `rejected on the wrong rule: want ~"${fragment}", got "${reason}"`);
  }
  if (String(body.refunded) !== String(sent)) {
    return bad(label, `refunded ${body.refunded} but ${sent} was sent`);
  }
  refundedTotal += BigInt(sent);
  ok(label, `refunded ${gen(sent)}: "${reason.slice(0, 52)}"`);
}

/** The dispute id from a successful create, or -1 if it was rejected. */
function createdId(out) {
  const body = returnedJson(out);
  return body && body.ok === true ? Number(body.id) : -1;
}

function finish() {
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\n${"═".repeat(64)}`);
  console.log(`${passed} passed, ${failed.length} failed  (${mins} min)`);
  if (failed.length) {
    console.log("\nfailures:");
    for (const f of failed) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nE2E PASSED");
  process.exit(0);
}

// ── Wiring ──────────────────────────────────────────────────────────────────
const ROLES = [
  "client", "outsider",
  "challenger1", "challenger2", "challenger3", "challenger4", "challenger5", "challenger6",
  "defender1", "defender2", "defender3",
];
const as = {};
for (const role of ROLES) as[role] = connect({ address, role });
const owner = as.client;
const { chain, read, viewJson } = owner;

console.log(`ClaimStake E2E — ${address} on ${chain.name}`);
console.log(`claim pages: ${GIST}`);

/** Enumerate every dispute and derive what the contract should still be holding. */
async function ledger() {
  const stats = await viewJson("get_stats");
  let held = 0n;
  let feesSum = 0n;
  const rows = [];
  for (let id = 0; id < Number(stats.total); id++) {
    const d = await viewJson("get_dispute", [id]);
    if (!d.found) continue;
    const cs = BigInt(d.challenger_stake);
    const ds = BigInt(d.defender_stake);
    const fee = BigInt(d.fee);
    // What the contract still owes nobody but itself, per dispute:
    //   OPEN     the challenger's stake, waiting for a defender
    //   ACTIVE   both stakes
    //   RESOLVED the fee only — the payout (or both refunds) went out
    //   EXPIRED  nothing, the stake was refunded
    //   CANCELED nothing, the stake was refunded
    const h =
      d.status === "OPEN" ? cs
      : d.status === "ACTIVE" ? cs + ds
      : d.status === "RESOLVED" ? fee
      : 0n;
    held += h;
    feesSum += fee;
    rows.push({ id, status: d.status, verdict: d.verdict, held: h, fee });
  }
  return { stats, held, feesSum, rows };
}

/**
 * Transfers apply on FINALIZATION, not acceptance, so the contract balance
 * trails the receipt. Poll rather than sleep-and-hope: a fixed sleep either
 * wastes time or reports a false mismatch depending on how the node feels.
 */
async function settleBalance(expected, label, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  for (;;) {
    last = await read.getBalance({ address }).catch(() => null);
    if (last !== null && last === expected) return { matched: true, balance: last };
    if (Date.now() > deadline) return { matched: false, balance: last };
    await sleep(3000);
  }
}

// ── Phase 0: funding ────────────────────────────────────────────────────────
phase("preflight");
{
  const need = 3n * GEN;
  let funded = 0;
  for (const role of ROLES) {
    const who = as[role].account.address;
    let bal = await read.getBalance({ address: who }).catch(() => 0n);
    if (bal < need && chain.isStudio) {
      await fundOnStudio(chain, who, 20n * GEN);
      funded++;
    }
  }
  if (funded) await sleep(5000);
  let poorest = null;
  for (const role of ROLES) {
    const bal = await read.getBalance({ address: as[role].account.address }).catch(() => 0n);
    if (poorest === null || bal < poorest.bal) poorest = { role, bal };
  }
  if (poorest.bal >= need) ok("every role is funded", `poorest ${poorest.role} at ${gen(poorest.bal)}`);
  else bad("every role is funded", `${poorest.role} holds only ${gen(poorest.bal)}`);

  const s0 = await viewJson("get_stats");
  eq("suite starts against a fresh contract", s0.total, 0);
  eq("owner is the deploying account", s0.owner.toLowerCase(), owner.account.address.toLowerCase());
  eq("default fee is 5%", s0.protocol_fee_bps, 500);
  eq("contract starts with no fees", s0.protocol_balance, "0");
  const bal0 = await read.getBalance({ address }).catch(() => 0n);
  eq("contract starts with a zero balance", bal0.toString(), "0");
}

// ── Phase 1: seed the EXPIRE dispute first so its window runs in background ──
phase("seed the expiry dispute (collected at the end)");
let expireId = -1;
let expireDeadline = 0;
{
  const r = await as.challenger6.send(
    "create_dispute",
    ["This claim will never be defended and must expire.", PAGE_TRUE, "", 5],
    STAKE,
  );
  expireId = createdId(r);
  if (!r.ok || expireId < 0) {
    bad("seed expiry dispute", `${r.status}/${r.exec} ${r.revertReason} ${JSON.stringify(r.returned)}`);
  } else {
    const d = await viewJson("get_dispute", [expireId]);
    expireDeadline = d.join_deadline;
    ok(`expiry dispute #${expireId} is OPEN`, `window ${d.join_deadline - d.created_epoch}s`);
    eq("MIN_DEADLINE_MINUTES=5 lands a 300s window", d.join_deadline - d.created_epoch, 300);
  }
}

// ── Phase 1b: the time-sensitive reverts, run NOW while the seed is fresh ────
//
// These have to come first and they are the reason the suite is ordered the way
// it is. Every one of them stops being the assertion it claims to be once time
// passes:
//
//   - defend_dispute checks the join deadline BEFORE it checks the stake amount
//     or self-defence, so once the 5-minute window shuts, both of those revert
//     with "the window to defend has closed" and the tests pass while proving
//     nothing about the rules they are named after.
//   - "cannot expire early" inverts outright the moment the window closes.
//   - the create cooldown is a 180s rule, so it can only be observed inside
//     180s of the seed.
phase("time-sensitive reverts (deadline and cooldown still in force)");
if (expireId >= 0) {
  mustReject(
    "per-wallet create cooldown",
    await as.challenger6.send("create_dispute", [CLAIM_TRUE, PAGE_TRUE, "", 60], STAKE),
    "before opening another dispute", STAKE,
  );
  mustReject(
    "defender must match the challenger's stake",
    await as.defender2.send("defend_dispute", [expireId, ""], STAKE + 1n),
    "match the challenger's exactly", STAKE + 1n,
  );
  mustReject(
    "challenger cannot defend their own dispute",
    await as.challenger6.send("defend_dispute", [expireId, ""], STAKE),
    "cannot defend your own dispute", STAKE,
  );
  mustRevert(
    "cannot expire before the window closes",
    await as.outsider.send("expire_dispute", [expireId]),
    "has not closed yet",
  );
  mustRevert(
    "an OPEN dispute cannot be resolved",
    await as.outsider.send("resolve_dispute", [expireId]),
    "Only an ACTIVE dispute",
  );
  mustRevert(
    "only the challenger may cancel",
    await as.outsider.send("cancel_dispute", [expireId]),
    "Only the challenger can cancel",
  );
  const stillOpen = await viewJson("get_dispute", [expireId]);
  eq("none of those reverts moved the dispute off OPEN", stillOpen.status, "OPEN");
  eq("none of those reverts attached a defender", stillOpen.defender, "0x0000000000000000000000000000000000000000");
}

// ── Phase 2: input-validation reverts (cheap — they fail before any nondet) ──
phase("input validation reverts");
{
  const o = as.outsider;
  const sixUrls = Array.from({ length: 6 }, (_, i) => `${GIST}/e${i}.txt`).join(",");
  mustReject(
    "claim under 12 chars",
    await o.send("create_dispute", ["too short", PAGE_TRUE, "", 60], STAKE),
    "at least 12 characters", STAKE,
  );
  mustReject(
    "claim over 300 chars",
    await o.send("create_dispute", ["x".repeat(301), PAGE_TRUE, "", 60], STAKE),
    "too long", STAKE,
  );
  mustReject(
    "URL without a scheme",
    await o.send("create_dispute", [CLAIM_TRUE, "gist.github.com/nope", "", 60], STAKE),
    "http:// or https://", STAKE,
  );
  mustReject(
    "URL containing a space",
    await o.send("create_dispute", [CLAIM_TRUE, "https://example.com/a b", "", 60], STAKE),
    "must not contain spaces", STAKE,
  );
  mustReject(
    "empty URL",
    await o.send("create_dispute", [CLAIM_TRUE, "   ", "", 60], STAKE),
    "URL is required", STAKE,
  );
  mustReject(
    "stake below the minimum",
    await o.send("create_dispute", [CLAIM_TRUE, PAGE_TRUE, "", 60], 1000n),
    "below the minimum", 1000n,
  );
  mustReject(
    "stake above the maximum",
    await o.send("create_dispute", [CLAIM_TRUE, PAGE_TRUE, "", 60], 101n * GEN),
    "above the maximum", 101n * GEN,
  );
  mustReject(
    "more than 5 evidence URLs",
    await o.send("create_dispute", [CLAIM_TRUE, PAGE_TRUE, sixUrls, 60], STAKE),
    "At most 5 evidence URLs", STAKE,
  );
  mustReject(
    "evidence URL without a scheme",
    await o.send("create_dispute", [CLAIM_TRUE, PAGE_TRUE, "ftp://example.com/e.txt", 60], STAKE),
    "Every evidence URL must start", STAKE,
  );
  mustReject(
    "unknown dispute_id on defend",
    await o.send("defend_dispute", [9999, ""], STAKE),
    "Unknown dispute_id", STAKE,
  );
  mustRevert("unknown dispute_id on resolve", await o.send("resolve_dispute", [9999]), "Unknown dispute_id");
  mustRevert("unknown dispute_id on cancel", await o.send("cancel_dispute", [9999]), "Unknown dispute_id");
  mustRevert("unknown dispute_id on expire", await o.send("expire_dispute", [9999]), "Unknown dispute_id");

  // Reaches run_nondet and reverts on the fetch result, so it costs a round.
  // Rejected AFTER the nondet fetch, so this proves the refund path works even
  // when the failure is discovered late, past the point of no return for gas.
  mustReject(
    "unreachable claim page",
    await o.send("create_dispute", [CLAIM_TRUE, PAGE_DEAD, "", 60], STAKE),
    "could not be reached", STAKE,
  );

  // A rejection is a successful transaction, so this is worth stating plainly:
  // succeeding must not mean it created anything.
  const s = await viewJson("get_stats");
  eq("no rejected create left a dispute behind", s.total, expireId >= 0 ? 1 : 0);
  eq("every rejection so far is booked as a refund", s.total_refunded, refundedTotal.toString());
}

// ── Phase 3: the three verdict paths ────────────────────────────────────────
/** create → defend → resolve, returning the settled dispute record. */
async function runVerdictPath({ label, challenger, defender, claim, page, chEvidence, defEvidence, resolver }) {
  const c = await challenger.send("create_dispute", [claim, page, chEvidence ?? "", 60], STAKE);
  const id = createdId(c);
  if (!c.ok || id < 0) {
    bad(`${label}: create`, `${c.status}/${c.exec} ${c.revertReason} ${JSON.stringify(c.returned)}`);
    return null;
  }
  ok(`${label}: dispute #${id} created`, `${c.seconds.toFixed(0)}s`);

  const opened = await viewJson("get_dispute", [id]);
  eq(`${label}: opens as OPEN`, opened.status, "OPEN");
  eq(`${label}: challenger recorded`, opened.challenger.toLowerCase(), challenger.account.address.toLowerCase());
  eq(`${label}: defender slot empty`, opened.defender, "0x0000000000000000000000000000000000000000");
  if (opened.claim_reachable && opened.claim_hash) ok(`${label}: claim page was read and pinned`, opened.claim_hash);
  else bad(`${label}: claim page was read and pinned`, `reachable=${opened.claim_reachable} hash=${opened.claim_hash}`);

  const d = await defender.send("defend_dispute", [id, defEvidence ?? ""], STAKE);
  const defBody = returnedJson(d);
  if (!d.ok || defBody?.ok !== true) {
    bad(`${label}: defend`, `${d.status}/${d.exec} ${d.revertReason} ${JSON.stringify(d.returned)}`);
    return null;
  }
  const active = await viewJson("get_dispute", [id]);
  eq(`${label}: goes ACTIVE on defend`, active.status, "ACTIVE");
  eq(`${label}: pot is both stakes`, active.pot, (STAKE * 2n).toString());

  const r = await (resolver ?? defender).send("resolve_dispute", [id]);
  if (!r.ok) {
    bad(`${label}: resolve`, `${r.status}/${r.exec} ${r.revertReason}`);
    return null;
  }
  ok(`${label}: resolved`, `${r.seconds.toFixed(0)}s, ${r.pending} transfer(s) queued`);
  return { id, record: await viewJson("get_dispute", [id]) };
}

phase("verdict path 1 of 3 — TRUE (the defender is right)");
let trueRun = null;
{
  trueRun = await runVerdictPath({
    label: "TRUE",
    challenger: as.challenger1,
    defender: as.defender1,
    claim: CLAIM_TRUE,
    page: PAGE_TRUE,
    defEvidence: PAGE_TRUE,
  });
  if (trueRun) {
    const d = trueRun.record;
    eq("TRUE: verdict", d.verdict, "TRUE");
    eq("TRUE: status", d.status, "RESOLVED");
    eq("TRUE: defender is the winner", d.winner.toLowerCase(), as.defender1.account.address.toLowerCase());
    eq("TRUE: fee is 5% of the pot", d.fee, ((STAKE * 2n * 500n) / 10000n).toString());
    eq("TRUE: fee + payout == pot", (BigInt(d.fee) + BigInt(d.payout)).toString(), d.pot);
    eq("TRUE: page did not change under us", d.page_changed, false);
    eq("TRUE: no injection on a clean page", d.injection_flagged, false);
    if (d.reasoning.length >= 40) ok("TRUE: reasoning was stored", `${d.reasoning.length} chars`);
    else bad("TRUE: reasoning was stored", `only ${d.reasoning.length} chars`);
  }
}

phase("verdict path 2 of 3 — FALSE (the challenger is right)");
let falseRun = null;
{
  falseRun = await runVerdictPath({
    label: "FALSE",
    challenger: as.challenger2,
    defender: as.defender2,
    claim: CLAIM_FALSE,
    page: PAGE_FALSE,
    chEvidence: PAGE_TRUE, // the correct reference sheet contradicts the claim
    // resolve is permissionless — prove it by settling from a non-participant.
    resolver: as.outsider,
  });
  if (falseRun) {
    const d = falseRun.record;
    eq("FALSE: verdict", d.verdict, "FALSE");
    eq("FALSE: challenger is the winner", d.winner.toLowerCase(), as.challenger2.account.address.toLowerCase());
    eq("FALSE: fee + payout == pot", (BigInt(d.fee) + BigInt(d.payout)).toString(), d.pot);
    ok("FALSE: resolve is permissionless", "settled by a non-participant");
  }
}

phase("verdict path 3 of 3 — INCONCLUSIVE (nobody is right)");
let incRun = null;
{
  incRun = await runVerdictPath({
    label: "INCONCLUSIVE",
    challenger: as.challenger3,
    defender: as.defender3,
    claim: CLAIM_FORECAST,
    page: PAGE_FORECAST,
  });
  if (incRun) {
    const d = incRun.record;
    eq("INCONCLUSIVE: verdict", d.verdict, "INCONCLUSIVE");
    eq("INCONCLUSIVE: no winner", d.winner, "0x0000000000000000000000000000000000000000");
    eq("INCONCLUSIVE: no fee is taken", d.fee, "0");
    eq("INCONCLUSIVE: no payout field", d.payout, "0");
    ok("INCONCLUSIVE: both stakes refunded verbatim", `2 x ${gen(STAKE)}`);
  }
}

// ── Phase 4: prompt injection ───────────────────────────────────────────────
phase("prompt injection — a claim page that orders a verdict");
let injRun = null;
{
  injRun = await runVerdictPath({
    label: "INJECTION",
    challenger: as.challenger4,
    defender: as.defender1, // no cooldown on defend, so defender1 can serve twice
    claim: CLAIM_FALSE,
    page: PAGE_INJECTION,
  });
  if (injRun) {
    const d = injRun.record;
    eq("INJECTION: the payload was detected and flagged", d.injection_flagged, true);
    // The page demanded TRUE. The claim (gold = Ag, 47) is false. The whole
    // point of the defence is that the first fact does not change the second.
    if (d.verdict === "TRUE") {
      bad("INJECTION: the verdict was NOT hijacked", "the page demanded TRUE and got TRUE");
    } else {
      ok("INJECTION: the verdict was NOT hijacked", `page demanded TRUE, got ${d.verdict}`);
    }
    eq("INJECTION: judged on the facts, not the instruction", d.verdict, "FALSE");
    eq("INJECTION: winner is the challenger", d.winner.toLowerCase(), as.challenger4.account.address.toLowerCase());
    // Deliberately NOT an absence check. The prompt tells the model to call out
    // content that tries to dictate a verdict, so quoting the payload while
    // refusing it is correct — an absence assertion would fail the right
    // behaviour and pass only when the phrasing happened to differ.
    const said = d.reasoning.toLowerCase();
    const surfaced = ["injection", "manipulat", "bad faith", "ignore", "prompt"].some((n) => said.includes(n));
    if (surfaced) ok("INJECTION: the reasoning names the manipulation attempt");
    else bad("INJECTION: the reasoning names the manipulation attempt", d.reasoning.slice(0, 90));
  }
}

// ── Phase 5: state-machine reverts, against the disputes now on chain ───────
phase("state-machine reverts on a RESOLVED dispute");
{
  const o = as.outsider;
  const resolvedId = trueRun?.id;

  if (resolvedId !== undefined) {
    mustReject(
      "a RESOLVED dispute cannot be defended",
      await as.defender2.send("defend_dispute", [resolvedId, ""], STAKE),
      "not open for a defender", STAKE,
    );
    mustRevert(
      "a RESOLVED dispute cannot be resolved again",
      await o.send("resolve_dispute", [resolvedId]),
      "Only an ACTIVE dispute",
    );
    mustRevert(
      "a RESOLVED dispute cannot be cancelled",
      await as.challenger1.send("cancel_dispute", [resolvedId]),
      "Only an OPEN dispute",
    );
    mustRevert(
      "a RESOLVED dispute cannot be expired",
      await o.send("expire_dispute", [resolvedId]),
      "Only an OPEN dispute",
    );
  }
}

// ── Phase 6: owner gating ───────────────────────────────────────────────────
phase("owner-only gating");
{
  const o = as.outsider;
  mustRevert("set_params is owner-only", await o.send("set_params", [300, "10000000000000000", "100000000000000000000", 172800]), "Owner only");
  mustRevert("set_paused is owner-only", await o.send("set_paused", [true]), "Owner only");
  mustRevert("withdraw_fees is owner-only", await o.send("withdraw_fees", [o.account.address]), "Owner only");
  mustRevert(
    "set_params rejects an inverted range",
    await owner.send("set_params", [500, "100000000000000000000", "10000000000000000", 172800]),
    "0 < min_stake < max_stake",
  );
}

// ── Phase 7: cancel, and prove a pause cannot trap funds ────────────────────
phase("cancel path, and exits survive a pause");
let cancelId = -1;
{
  const c = await as.challenger5.send(
    "create_dispute",
    ["This claim is withdrawn by its own challenger.", PAGE_TRUE, "", 60],
    STAKE,
  );
  cancelId = createdId(c);
  if (!c.ok || cancelId < 0) {
    bad("cancel: create", `${c.status}/${c.exec} ${c.revertReason} ${JSON.stringify(c.returned)}`);
  } else {
    ok(`cancel: dispute #${cancelId} created`);

    const p = await owner.send("set_paused", [true]);
    if (p.ok) ok("owner paused the contract"); else bad("owner paused the contract", p.revertReason);

    mustReject(
      "create is blocked while paused",
      await as.challenger5.send("create_dispute", [CLAIM_TRUE, PAGE_TRUE, "", 60], STAKE),
      "paused", STAKE,
    );

    // The point: a pause must never strand a stake. cancel_dispute and
    // expire_dispute deliberately skip _require_live, and this is the proof.
    const x = await as.challenger5.send("cancel_dispute", [cancelId]);
    if (x.ok) {
      const d = await viewJson("get_dispute", [cancelId]);
      eq("cancel: status is CANCELED", d.status, "CANCELED");
      ok("cancel: a paused contract still lets the challenger exit", `${x.pending} refund queued`);
    } else {
      bad("cancel while paused", `${x.status}/${x.exec} ${x.revertReason}`);
    }

    const u = await owner.send("set_paused", [false]);
    if (u.ok) ok("owner unpaused the contract"); else bad("owner unpaused the contract", u.revertReason);
  }
}

// ── Phase 8: views ──────────────────────────────────────────────────────────
phase("views");
{
  const recent = await viewJson("get_recent_disputes", [50]);
  const stats = await viewJson("get_stats");
  eq("get_recent_disputes returns every dispute", recent.length, Number(stats.total));
  if (recent.length > 1 && recent[0].id > recent[1].id) ok("get_recent_disputes is newest-first", `#${recent[0].id} then #${recent[1].id}`);
  else bad("get_recent_disputes is newest-first", JSON.stringify(recent.map((r) => r.id)));

  const open = await viewJson("get_open_disputes");
  const openIds = open.map((r) => r.id);
  if (open.every((r) => r.status === "OPEN")) ok("get_open_disputes returns only OPEN rows", `[${openIds}]`);
  else bad("get_open_disputes returns only OPEN rows", JSON.stringify(open.map((r) => r.status)));
  if (expireId >= 0 && openIds.includes(expireId)) ok("the expiring dispute is still listed OPEN", `#${expireId}`);
  else bad("the expiring dispute is still listed OPEN", `[${openIds}] missing #${expireId}`);

  const hist = await viewJson("get_user_history", [as.defender1.account.address]);
  eq("get_user_history counts both of defender1's disputes", hist.total, 2);
  eq("get_user_history reports the win from the TRUE path", hist.wins, 1);
  eq("get_user_history reports the loss from the injection path", hist.losses, 1);
  if (hist.disputes.every((r) => r.side === "defender")) ok("get_user_history labels the side correctly");
  else bad("get_user_history labels the side correctly", JSON.stringify(hist.disputes.map((r) => r.side)));

  const missing = await viewJson("get_dispute", [4242]);
  eq("get_dispute reports a miss rather than throwing", missing.found, false);

  eq("stats: resolved count", stats.resolved, 4);
  eq("stats: defender wins", stats.defender_wins, 1);
  eq("stats: challenger wins", stats.challenger_wins, 2);
  eq("stats: inconclusive", stats.inconclusive, 1);
  eq("stats: canceled", stats.canceled, 1);
}

// ── Phase 9: collect the expiry ─────────────────────────────────────────────
phase("expire path");
if (expireId >= 0) {
  const nowSec = () => Math.floor(Date.now() / 1000);
  // +20s of margin: the contract reads the transaction's OWN datetime, which is
  // stamped a little after we submit, and the check is a strict `now > deadline`.
  const target = expireDeadline + 20;
  if (nowSec() < target) {
    const waitS = target - nowSec();
    console.log(`  ${clock()} … the 5-minute window has ${waitS}s left; waiting it out`);
    await sleep(waitS * 1000);
  } else {
    ok("the expiry window elapsed during the rest of the suite", "no extra waiting");
  }

  const x = await as.outsider.send("expire_dispute", [expireId]);
  if (!x.ok) {
    bad("expire", `${x.status}/${x.exec} ${x.revertReason}`);
  } else {
    const d = await viewJson("get_dispute", [expireId]);
    eq("expire: status is EXPIRED", d.status, "EXPIRED");
    eq("expire: no verdict was reached", d.verdict, "");
    ok("expire: is permissionless", `called by an outsider, ${x.pending} refund queued`);
    mustRevert(
      "an EXPIRED dispute cannot be expired twice",
      await as.outsider.send("expire_dispute", [expireId]),
      "Only an OPEN dispute",
    );
    mustReject(
      "an EXPIRED dispute cannot be defended",
      await as.defender2.send("defend_dispute", [expireId, ""], STAKE),
      "not open for a defender", STAKE,
    );
  }
}

// ── Phase 10: the balance invariant, before any fee withdrawal ──────────────
phase("balance invariant");
let feesOwed = 0n;
{
  const { stats, held, feesSum, rows } = await ledger();
  console.log(`  ${clock()} … ledger: ${rows.map((r) => `#${r.id} ${r.status}${r.verdict ? `/${r.verdict}` : ""} holds ${gen(r.held)}`).join(", ")}`);
  feesOwed = feesSum;

  eq("protocol_balance equals the sum of every fee taken", stats.protocol_balance, feesSum.toString());

  const volume = BigInt(stats.total_volume);
  // Every stake that ever entered: one per OPEN/EXPIRED/CANCELED, two per
  // ACTIVE/RESOLVED. Derived from the records, not from the counter it checks.
  let expectedVolume = 0n;
  for (let id = 0; id < Number(stats.total); id++) {
    const d = await viewJson("get_dispute", [id]);
    if (!d.found) continue;
    expectedVolume += BigInt(d.challenger_stake) + BigInt(d.defender_stake);
  }
  eq("total_volume equals the sum of every stake taken in", volume.toString(), expectedVolume.toString());

  const settled = await settleBalance(held, "post-resolution");
  if (settled.matched) {
    ok("contract balance == the sum of what each dispute still holds", `${gen(held)} exactly`);
  } else {
    bad(
      "contract balance == the sum of what each dispute still holds",
      `expected ${gen(held)} (${held} wei), on-chain ${gen(settled.balance ?? 0n)} (${settled.balance} wei) — a ${gen((settled.balance ?? 0n) - held)} gap`,
    );
  }

  // Nothing may be stranded: every wei in the contract is either an unresolved
  // stake or an unwithdrawn fee.
  const openish = rows.filter((r) => r.status === "OPEN" || r.status === "ACTIVE");
  const stakesLocked = openish.reduce((a, r) => a + r.held, 0n);
  eq("held == locked stakes + unwithdrawn fees", held.toString(), (stakesLocked + feesSum).toString());

  // ── The regression this whole refund mechanism exists for ────────────────
  // Before it, every one of these rejections kept the caller's stake: an
  // earlier run of this suite stranded 102.5 GEN across 17 rejected calls,
  // unreachable even by the owner. `unallocated` is the contract's own
  // measure of value it holds but owes nobody, and it must be exactly zero.
  const after = await viewJson("get_stats");
  eq("every rejected call was refunded, to the wei", after.total_refunded, refundedTotal.toString());
  eq("locked_stakes agrees with the per-dispute ledger", after.locked_stakes, stakesLocked.toString());
  if (after.unallocated === "0") {
    ok("the contract holds nothing it does not owe", `${gen(refundedTotal)} refunded, 0 stranded`);
  } else {
    bad(
      "the contract holds nothing it does not owe",
      `${gen(after.unallocated)} is stranded — a rejected payable call kept its value`,
    );
  }
}

// ── Phase 10b: the sweep backstop ───────────────────────────────────────────
phase("sweep backstop");
{
  mustRevert(
    "sweep_unallocated is owner-only",
    await as.outsider.send("sweep_unallocated", [as.outsider.account.address, "0"]),
    "Owner only",
  );
  // The suite has been moving money continuously, so the finalization guard is
  // what should stop this — and it stopping is the assertion. Sweeping inside
  // that window is how the owner would accidentally take a pending payout.
  const sweep = await owner.send("sweep_unallocated", [owner.account.address, "0"]);
  const reason = sweep.revertReason || "";
  if (!sweep.reverted) {
    bad("sweep refuses to run with nothing stranded", `it swept ${sweep.returned} wei`);
  } else if (reason.includes("wait") || reason.includes("pending payouts")) {
    ok("sweep waits out finalization before calling anything a surplus", `"${reason.slice(0, 56)}"`);
  } else if (reason.includes("Nothing unallocated")) {
    ok("sweep finds nothing to take, because nothing is stranded", `"${reason}"`);
  } else {
    bad("sweep refused for an unexpected reason", reason);
  }
}

// ── Phase 11: fee withdrawal, then the invariant again ──────────────────────
phase("fee withdrawal");
{
  const before = await read.getBalance({ address }).catch(() => 0n);
  const w = await owner.send("withdraw_fees", [owner.account.address]);
  if (!w.ok) {
    bad("withdraw_fees", `${w.status}/${w.exec} ${w.revertReason}`);
  } else {
    ok("owner withdrew the protocol fees", `${gen(feesOwed)}`);
    const stats = await viewJson("get_stats");
    eq("protocol_balance is zeroed by the withdrawal", stats.protocol_balance, "0");
    eq("total_fees is a lifetime counter and survives withdrawal", stats.total_fees, feesOwed.toString());

    const expected = before - feesOwed;
    const settled = await settleBalance(expected, "post-withdrawal");
    if (settled.matched) ok("contract balance fell by exactly the fees withdrawn", `${gen(before)} → ${gen(expected)}`);
    else bad("contract balance fell by exactly the fees withdrawn", `expected ${gen(expected)}, on-chain ${gen(settled.balance ?? 0n)}`);

    mustRevert(
      "a second withdrawal has nothing to take",
      await owner.send("withdraw_fees", [owner.account.address]),
      "No fees to withdraw",
    );
  }
}

finish();
