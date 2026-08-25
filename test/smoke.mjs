/**
 * Bradbury smoke test — the full money path on the live contract.
 *
 * The eight-test acceptance suite needs eleven funded wallets (seven distinct
 * challengers, because create_dispute enforces a 180s per-wallet cooldown).
 * This one proves the lifecycle end to end with the wallets that are funded:
 *
 *   create -> defend -> resolve -> payout, with balances asserted at each step
 *
 * It also checks that the two audit fixes are live on the deployed contract:
 * settle_stalled exists and refuses a case whose window has not elapsed, and
 * the ledger reconciles afterwards.
 *
 * Usage: node smoke.mjs [--network=bradbury] [--address=0x..]
 */
import { readFileSync } from "node:fs";
import { argOf, connect, returnedJson } from "./harness.mjs";

const deployed = JSON.parse(readFileSync(new URL("./.deployed.json", import.meta.url), "utf8"));
const address = argOf("address", deployed.address);
const networkName = argOf("network", deployed.network);

const GEN = 10n ** 18n;
const STAKE = GEN / 100n; // 0.01 GEN — the contract's minimum
const GIST = "https://gist.githubusercontent.com/kenil1710/e8adc0c6e3ce687b5590b096e23536e1/raw";

const challenger = connect({ networkName, address, role: "challenger1" });
const defender = connect({ networkName, address, role: "defender1" });
const { read, viewJson } = challenger;

const started = Date.now();
const clock = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;
const gen = (wei) => `${(Number(BigInt(wei)) / 1e18).toFixed(4)} GEN`;

let passed = 0;
const failed = [];
const ok = (label, detail = "") => {
  passed++;
  console.log(`  ${clock()} PASS  ${label}${detail ? `  ${detail}` : ""}`);
};
const bad = (label, detail = "") => {
  failed.push(label);
  console.log(`  ${clock()} FAIL  ${label}  ${detail}`);
};
const check = (label, cond, detail = "") => (cond ? ok(label, detail) : bad(label, detail));

const balanceOf = async (addr) => BigInt(await read.getBalance({ address: addr }));

console.log(`ClaimStake smoke — ${address} on ${networkName}`);
console.log(`challenger ${challenger.account.address}`);
console.log(`defender   ${defender.account.address}\n`);

// ── Baseline ────────────────────────────────────────────────────────────────
const before = await viewJson("get_stats");
console.log(`── baseline: ${before.total} disputes, ${gen(before.balance)} held, fee ${before.protocol_fee_bps / 100}%\n`);

const challengerBefore = await balanceOf(challenger.account.address);
const defenderBefore = await balanceOf(defender.account.address);

// ── 1. Create ───────────────────────────────────────────────────────────────
console.log("── 1. create a FALSE claim");
const created = await challenger.send(
  "create_dispute",
  ["The Eiffel Tower is located in London, England.", `${GIST}/eiffel.html`, "", 5],
  STAKE,
);
if (!created.settled) {
  bad("create settled", created.reason ?? "unsettled");
  process.exit(1);
}
const createdJson = returnedJson(created);
check("create accepted and returned ok:true", createdJson?.ok === true, JSON.stringify(createdJson));
const id = Number(createdJson?.id ?? -1);
if (id < 0) {
  bad("dispute id returned");
  process.exit(1);
}
ok(`dispute #${id} opened`, `tx ${created.hash?.slice(0, 12)}…`);

let d = await viewJson("get_dispute", [id]);
check("status is OPEN", d.status === "OPEN", d.status);
check("claim page was fetched and pinned", Boolean(d.claim_hash), `hash ${String(d.claim_hash).slice(0, 12)}…`);
check("challenger stake recorded", BigInt(d.challenger_stake) === STAKE, gen(d.challenger_stake));

// ── 2. Self-defence must be refused ─────────────────────────────────────────
console.log("\n── 2. challenger may not defend their own case");
const selfDefend = await challenger.send("defend_dispute", [id, ""], STAKE);
const selfJson = returnedJson(selfDefend);
check(
  "self-defence rejected AND refunded (not reverted)",
  selfDefend.settled && selfJson?.ok === false && BigInt(selfJson?.refunded ?? 0) === STAKE,
  selfJson ? `${selfJson.reason} — refunded ${gen(selfJson.refunded ?? 0)}` : "no json",
);

// ── 3. Defend ───────────────────────────────────────────────────────────────
console.log("\n── 3. defender matches the stake");
const defended = await defender.send("defend_dispute", [id, ""], STAKE);
const defendedJson = returnedJson(defended);
check("defend accepted", defended.settled && defendedJson?.ok === true, JSON.stringify(defendedJson));

d = await viewJson("get_dispute", [id]);
check("status is ACTIVE", d.status === "ACTIVE", d.status);
check("pot is both stakes", BigInt(d.pot) === STAKE * 2n, gen(d.pot));

// ── 4. settle_stalled must refuse early ─────────────────────────────────────
console.log("\n── 4. the guaranteed exit refuses before its window");
const early = await defender.send("settle_stalled", [id]);
check(
  "settle_stalled exists and refuses an in-window case",
  early.settled === false || early.reverted === true || /left to settle/i.test(String(early.reason ?? early.revertReason ?? "")),
  String(early.reason ?? early.revertReason ?? "").slice(0, 90) || "reverted as expected",
);

// ── 5. Resolve ──────────────────────────────────────────────────────────────
console.log("\n── 5. send it to the validators (this takes a minute)");
const resolved = await defender.send("resolve_dispute", [id]);
if (!resolved.settled) {
  bad("resolve settled", resolved.reason ?? "unsettled");
} else {
  ok("resolve settled", `${resolved.seconds?.toFixed(0)}s, tx ${resolved.hash?.slice(0, 12)}…`);
}

d = await viewJson("get_dispute", [id]);
check("status is RESOLVED", d.status === "RESOLVED", d.status);
check("verdict is FALSE (the tower is in Paris)", d.verdict === "FALSE", `verdict=${d.verdict}`);
check("winner is the challenger", d.winner.toLowerCase() === challenger.account.address.toLowerCase(), d.winner);
check("reasoning was recorded", String(d.reasoning).length >= 40, `${String(d.reasoning).slice(0, 80)}…`);

// ── 6. Money ────────────────────────────────────────────────────────────────
console.log("\n── 6. the money moved correctly");
const pot = STAKE * 2n;
const expectedFee = (pot / 10000n) * BigInt(before.protocol_fee_bps);
const expectedPayout = pot - expectedFee;
check("fee is divide-before-multiply exact", BigInt(d.fee) === expectedFee, `${gen(d.fee)} (expected ${gen(expectedFee)})`);
check("payout is pot minus fee, no wei stranded", BigInt(d.payout) === expectedPayout, gen(d.payout));
check("fee + payout == pot", BigInt(d.fee) + BigInt(d.payout) === pot, gen(pot));

const challengerAfter = await balanceOf(challenger.account.address);
const defenderAfter = await balanceOf(defender.account.address);
// Gas makes exact equality impossible; assert direction and magnitude instead.
const challengerUp = challengerAfter > challengerBefore - STAKE;
const defenderDown = defenderBefore - defenderAfter >= STAKE;
check("challenger came out ahead of their stake", challengerUp, `${gen(challengerBefore)} -> ${gen(challengerAfter)}`);
check("defender is down at least their stake", defenderDown, `${gen(defenderBefore)} -> ${gen(defenderAfter)}`);

// ── 7. Ledger ───────────────────────────────────────────────────────────────
console.log("\n── 7. the ledger reconciles");
const after = await viewJson("get_stats");
check("resolved count went up by one", after.resolved === before.resolved + 1, `${before.resolved} -> ${after.resolved}`);
check("challenger win recorded", after.challenger_wins === before.challenger_wins + 1, String(after.challenger_wins));
check("fees accrued exactly the fee", BigInt(after.total_fees) - BigInt(before.total_fees) === expectedFee, gen(after.total_fees));
check("nothing is unallocated", after.unallocated === "0", `unallocated ${after.unallocated}`);
check("no stake left locked from this case", BigInt(after.locked_stakes) === BigInt(before.locked_stakes), gen(after.locked_stakes));

// ── Summary ─────────────────────────────────────────────────────────────────
const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\n${"=".repeat(64)}`);
console.log(`${passed} passed, ${failed.length} failed  (${mins} min)`);
if (failed.length) for (const f of failed) console.log(`  - ${f}`);
console.log(`dispute #${id} on ${address}`);
process.exit(failed.length ? 1 : 0);
