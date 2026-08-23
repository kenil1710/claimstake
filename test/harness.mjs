/**
 * Shared helpers for the ClaimStake integration scripts.
 *
 * The important one is `outcomeOf`. Studionet and Bradbury report a revert in
 * DIFFERENT PLACES, and reading the wrong one turns every failed transaction
 * into a silent pass:
 *
 *   - Bradbury sets `tx.txExecutionResultName` to "FINISHED_WITH_ERROR".
 *   - Studionet leaves `txExecutionResultName` UNDEFINED and records the real
 *     outcome at `tx.consensus_data.leader_receipt[0].execution_result`
 *     ("SUCCESS" | "ERROR").
 *
 * A check written against `txExecutionResultName` alone reads `undefined !==
 * "FINISHED_WITH_ERROR"` on Studionet and reports success for a transaction
 * that reverted and rolled back. That cost a false pass on the u128 storage
 * gate before this helper existed.
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import { readFileSync } from "node:fs";

export const CHAINS = { studionet, bradbury: testnetBradbury };

/** States that genuinely end a transaction — see deploy.mjs for why not DECIDED_STATES. */
export const TERMINAL_STATES = ["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const argOf = (name, fallback = null) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

/**
 * The single source of truth for "did this transaction actually work".
 * Returns { settled, ok, exec, status, stderr, pending, raw }.
 */
export function outcomeOf(tx) {
  const status = transactionsStatusNumberToName[tx?.status];
  const receipt = tx?.consensus_data?.leader_receipt?.[0];
  const exec = receipt?.execution_result ?? null;
  const named = tx?.txExecutionResultName ?? null;

  const settled = Boolean(status && TERMINAL_STATES.includes(status));
  // Explicit ERROR on either surface is a failure. Absence of a receipt is NOT
  // treated as success.
  const reverted = exec === "ERROR" || named === "FINISHED_WITH_ERROR";
  const accepted = status === "ACCEPTED" || status === "FINALIZED";

  return {
    settled,
    status,
    exec,
    named,
    // A receipt that carries an explicit result must say SUCCESS; one that
    // carries none (Bradbury deploys) falls back to the transaction status.
    ok: settled && accepted && !reverted && (exec === null || exec === "SUCCESS"),
    reverted,
    stderr: String(receipt?.genvm_result?.stderr ?? receipt?.stderr ?? ""),
    stdout: String(receipt?.genvm_result?.stdout ?? receipt?.stdout ?? ""),
    pending: (receipt?.pending_transactions ?? []).length,
    raw: receipt ?? null,
  };
}

/** The last frame of a GenVM traceback — the line that actually failed. */
export function failureLine(stderr) {
  const lines = String(stderr).split("\n").filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("/contract.py")) return lines[i].trim();
  }
  return lines[lines.length - 1]?.trim() ?? "";
}

/** Studionet-only faucet. No-op elsewhere. */
export async function fundOnStudio(chain, address, wei) {
  if (!chain.isStudio) return false;
  const res = await fetch(chain.rpcUrls.default.http[0], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sim_fundAccount",
      params: [address, Number(wei)],
    }),
  });
  const json = await res.json();
  return Boolean(json?.result);
}

/**
 * Retry a flaky RPC call.
 *
 * Studionet intermittently answers with an HTML error page instead of JSON,
 * which surfaces as `Unexpected token '<'`. That is infrastructure noise, not a
 * contract fault, and without a retry it aborts a run mid-assertion and reads
 * like a failure of whatever call happened to be in flight.
 */
export async function retry(fn, { attempts = 5, baseMs = 1500, label = "rpc" } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const transient =
        /Unexpected token '<'|not valid JSON|fetch failed|ECONNRESET|ETIMEDOUT|502|503|504/i.test(
          String(e?.message ?? e),
        );
      if (!transient || i === attempts) throw e;
      console.log(`  … ${label} attempt ${i} hit transient RPC noise, retrying`);
      await sleep(baseMs * i);
    }
  }
  throw last;
}

/** Builds the read/wallet client pair plus a settle-aware `send`. */
export function connect({ networkName = argOf("network", "studionet"), address } = {}) {
  const chain = CHAINS[networkName];
  if (!chain) throw new Error(`unknown network ${networkName}`);
  const acc = JSON.parse(readFileSync(new URL("./.accounts.json", import.meta.url), "utf8"));
  const account = createAccount(acc.client.key);
  const wallet = createClient({ chain, account });
  const read = createClient({ chain });
  const deadline = chain.isStudio ? 240_000 : 1_200_000;
  const pollMs = chain.isStudio ? 1_000 : 5_000;

  async function send(functionName, args = [], value = 0n) {
    const hash = await retry(
      () => wallet.writeContract({ address, functionName, args, value }),
      { label: functionName },
    );
    const started = Date.now();
    let nudges = 0;
    for (;;) {
      const tx = await read.getTransaction({ hash }).catch(() => null);
      const out = outcomeOf(tx);
      if (out.settled) return { ...out, hash, tx, seconds: (Date.now() - started) / 1000 };
      if (!chain.isStudio && Date.now() - started > (nudges + 1) * 45_000 && nudges < 10) {
        nudges++;
        await wallet.finalizeIdlenessTxs({ txIds: [hash] }).catch(() => {});
      }
      if (Date.now() - started > deadline) throw new Error(`${functionName} never settled`);
      await sleep(pollMs);
    }
  }

  const view = async (functionName, args = []) =>
    retry(() => read.readContract({ address, functionName, args }), { label: functionName });
  const viewJson = async (functionName, args = []) => JSON.parse(await view(functionName, args));

  return { chain, account, wallet, read, send, view, viewJson };
}
