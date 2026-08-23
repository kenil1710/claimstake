/**
 * Storage-shape gate for ClaimStake. Decides how money fields get typed.
 *
 * Q1  u128 round-trips a value that overflows u64 (100 GEN = 1e20 wei)
 * Q2  emit_transfer works when the value is READ FROM a u128 field   <-- the one
 * Q3  TreeMap[Address, DynArray[u32]] via get_or_insert_default
 * Q4  DynArray[str] inside a TreeMap-stored dataclass can be appended
 *
 * Q2 is the decider: AuditCourt found a u256 field breaks the emit_transfer
 * call site. If u128 breaks it too, ClaimStake money stays u64 and MAX_STAKE
 * drops from 100 GEN to 5 GEN.
 *
 * Every payout assertion runs against a FUNDED contract and is paired with a
 * u64 control. An unfunded emit_transfer fails for both field types, which
 * looks exactly like a u128 fault and is not one.
 *
 * Usage: node gate-u128.mjs [--network=studionet] [--address=0x..]
 */
import { readFileSync } from "node:fs";
import { argOf, connect, fundOnStudio, failureLine, sleep } from "./harness.mjs";

const deployed = JSON.parse(readFileSync(new URL("./.deployed.json", import.meta.url), "utf8"));
const address = argOf("address", deployed.address);
const { chain, account, read, send, viewJson } = connect({ address });

const GEN = 10n ** 18n;
const MAX_U64 = 18446744073709551615n; // 18.446744... GEN
const HUNDRED_GEN = 100n * GEN; // 1e20 — 5.4x the u64 ceiling

let passed = 0;
const failed = [];
const ok = (l, d = "") => { passed++; console.log(`  ✓ ${l}${d ? `  ${d}` : ""}`); };
const bad = (l, d) => { failed.push(`${l} — ${d}`); console.log(`  ✗ ${l}  ${d}`); };

console.log(`gate against ${address} on ${chain.name}\n`);

// ── Funding ─────────────────────────────────────────────────────────────────
// Without this every payout fails identically for u64 and u128 and the gate
// reads as a type fault. Needs to cover a 100 GEN transfer with headroom.
let balance = await read.getBalance({ address: account.address }).catch(() => 0n);
if (balance < 150n * GEN && chain.isStudio) {
  await fundOnStudio(chain, account.address, 300n * GEN);
  await sleep(5000);
  balance = await read.getBalance({ address: account.address }).catch(() => 0n);
}
console.log(`signer balance: ${(balance / GEN).toString()} GEN`);
if (balance < 120n * GEN) {
  console.log("REFUSING to run: the payout assertions need >=120 GEN or they cannot distinguish");
  console.log("a u128 fault from an unfunded transfer. Fund the signer and re-run.");
  process.exit(2);
}

// ── Q1: u128 round-trip past the u64 ceiling ────────────────────────────────
console.log("\nQ1  u128 stores a value that overflows u64");
const s1 = await send("store", [HUNDRED_GEN.toString(), "alpha,beta,gamma"]);
const slotId = s1.ok ? Number((await viewJson("get_stats")).next_id) - 1 : -1;
if (!s1.ok) {
  bad("store(100 GEN)", `${s1.status}/${s1.exec} ${failureLine(s1.stderr)}`);
} else {
  ok("store(100 GEN) accepted");
  const slot = await viewJson("get_slot", [slotId]);
  if (slot.amount_u128 === HUNDRED_GEN.toString()) {
    ok("u128 round-trip exact", `${slot.amount_u128} wei (u64 max is ${MAX_U64})`);
  } else {
    bad("u128 round-trip", `stored ${HUNDRED_GEN}, read ${slot.amount_u128}`);
  }
  if (JSON.stringify(slot.labels) === JSON.stringify(["alpha", "beta", "gamma"])) {
    ok("Q4  DynArray[str] append inside stored dataclass", slot.labels.join("/"));
  } else {
    bad("Q4  DynArray[str] append", JSON.stringify(slot.labels));
  }
}

// ── Q3: TreeMap[Address, DynArray[u32]] ─────────────────────────────────────
console.log("\nQ3  TreeMap[Address, DynArray[u32]] via get_or_insert_default");
const idx = await viewJson("get_user_slots", [account.address]);
if (Array.isArray(idx) && idx.includes(slotId)) ok("per-user index", JSON.stringify(idx));
else bad("per-user index", JSON.stringify(idx));

// ── Q2: emit_transfer sourced from a u128 field ─────────────────────────────
console.log("\nQ2  emit_transfer with the value read from a u128 field");

// Fund the contract so a transfer has something to move.
const fund = await send("fund", [], HUNDRED_GEN + GEN);
if (!fund.ok) {
  bad("fund(101 GEN)", `${fund.status}/${fund.exec} ${failureLine(fund.stderr)}`);
} else {
  const contractBal = await read.getBalance({ address }).catch(() => 0n);
  ok("fund(101 GEN) accepted", `contract holds ${contractBal.toString()} wei`);

  // The decisive case: transfer a value LARGER than u64 max, read from u128.
  const big = await send("payout_from_u128", [slotId]);
  if (big.ok) {
    ok("payout of 100 GEN from u128", `pending_transfers=${big.pending} — u128 -> emit_transfer WORKS`);
  } else {
    bad("payout of 100 GEN from u128", `${big.status}/${big.exec} ${failureLine(big.stderr)}`);
    // Control on the SAME funded contract: if a u64-sourced transfer also
    // fails, the fault is not the field type.
    const ctlId = Number((await viewJson("get_stats")).next_id);
    await send("store", [(GEN / 100n).toString(), "ctl"]);
    const ctl = await send("payout_from_u64", [ctlId]);
    console.log(
      ctl.ok
        ? "     control: payout_from_u64 SUCCEEDS -> the u128 field is genuinely the cause"
        : `     control: payout_from_u64 also fails (${ctl.exec}) -> not a field-type fault`,
    );
  }

  // A small u64-sourced transfer on the same funded contract, as a positive
  // control that the harness and funding are sound.
  const smallId = Number((await viewJson("get_stats")).next_id);
  await send("store", [(GEN / 100n).toString(), "small"]);
  const small = await send("payout_from_u64", [smallId]);
  if (small.ok) ok("control: 0.01 GEN from u64", `pending_transfers=${small.pending}`);
  else bad("control: 0.01 GEN from u64", `${small.exec} ${failureLine(small.stderr)}`);
}

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  console.log("\nVERDICT: money fields stay u64, MAX_STAKE = 5 GEN");
  process.exit(1);
}
console.log("\nVERDICT: u128 is safe for money fields, MAX_STAKE = 100 GEN as specced");
