/**
 * Creates test/.accounts.json with a stable, reusable signing key.
 *
 * Written by hand rather than from `createAccount()` because that helper does
 * NOT expose a `privateKey` field — it returns a viem account whose key stays
 * private to the closure. Persisting `account.privateKey` therefore writes
 * `undefined`, JSON.stringify drops the field entirely, and every later
 * `createAccount(undefined)` silently mints a brand-new random account.
 *
 * On gasless Studionet that failure is invisible: every run works, just from a
 * different address each time. It only surfaces later, as cooldown and
 * per-address quota tests that can never trigger, an `owner` nobody holds the
 * key to, and an unfunded sender on Bradbury.
 *
 * Usage: node accounts.mjs [--force]
 */
import { createAccount } from "genlayer-js";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const target = new URL("./.accounts.json", import.meta.url);
const force = process.argv.includes("--force");

if (existsSync(target) && !force) {
  console.log(".accounts.json already exists — pass --force to replace it");
  process.exit(0);
}

const key = `0x${randomBytes(32).toString("hex")}`;
const account = createAccount(key);

// Round-trip assertion: the stored address must be the one this key actually
// derives. Without it, a mismatch just sits in the file looking plausible.
const roundTripped = createAccount(key);
if (roundTripped.address !== account.address) {
  throw new Error("key does not derive a stable address");
}

writeFileSync(
  target,
  JSON.stringify({ client: { key, address: account.address } }, null, 2) + "\n",
);

console.log(`wrote .accounts.json`);
console.log(`  address: ${account.address}`);
console.log(`  (gasless on Studionet; fund this address before using Bradbury)`);
