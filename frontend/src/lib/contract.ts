/**
 * Typed access to the deployed ClaimStake contract.
 *
 * Two things here are not boilerplate and are the reason this file exists:
 *
 *   1. `waitForWrite` treats a REVERT as a failure. The SDK reports a reverted
 *      transaction as an ordinary settled one — the revert lives at
 *      `consensus_data.leader_receipt[0].execution_result` on Studionet and at
 *      `txExecutionResultName` on Bradbury, and reading neither means a call
 *      that rolled back looks like a success.
 *
 *   2. `submitPayable` treats a REJECTION as a failure too. ClaimStake's
 *      payable methods answer bad input with a successful transaction that
 *      refunds and returns `{ok: false, reason}`, because a revert would keep
 *      the caller's stake. So "the transaction succeeded" and "the dispute was
 *      opened" are different questions, and the UI has to ask the second one.
 */
import { transactionsStatusNumberToName, type Hash } from "genlayer-js/types";
import { CONTRACT_ADDRESS, chain, getReadClient, getWalletClient } from "./genlayer";
import type {
  Dispute,
  DisputeSummary,
  Stats,
  UserHistory,
  WriteResult,
} from "@/types";

/**
 * The SDK's own hash type, not a bare `0x${string}`.
 *
 * `Hash` is branded with `{ length: 66 }`, so a plain hex-template string is not
 * assignable to it and `getTransaction({ hash })` refuses the looser type.
 */
export type TransactionHash = Hash;

/** Raised when the caller navigated away; not worth surfacing as an error. */
export class AbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * States that genuinely end a transaction.
 *
 * Deliberately NOT the SDK's `DECIDED_STATES`, which also lists
 * `LEADER_TIMEOUT` and `VALIDATORS_TIMEOUT`. Those are not terminal — the
 * network rotates to the next leader and carries on. Stopping there abandons a
 * transaction that is still alive and reports a failure that never happened.
 */
const TERMINAL_STATES = ["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"];

// ── Views ───────────────────────────────────────────────────────────────────

/**
 * The SDK types `args` as `CalldataEncodable[]`, a union that does not accept a
 * bare `unknown[]`. Everything ClaimStake passes is a string or a number, so
 * that is the parameter type here rather than a cast at each call site.
 */
type Arg = string | number | boolean;

async function view<T>(functionName: string, args: Arg[] = []): Promise<T> {
  const raw = await getReadClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  });
  return JSON.parse(String(raw)) as T;
}

export function getStats(): Promise<Stats> {
  return view<Stats>("get_stats");
}

export function getRecentDisputes(count = 40): Promise<DisputeSummary[]> {
  return view<DisputeSummary[]>("get_recent_disputes", [count]);
}

export function getOpenDisputes(): Promise<DisputeSummary[]> {
  return view<DisputeSummary[]>("get_open_disputes");
}

export function getUserHistory(who: string): Promise<UserHistory> {
  return view<UserHistory>("get_user_history", [who]);
}

export async function getDispute(id: number): Promise<Dispute | null> {
  const found = await view<Dispute | { found: false }>("get_dispute", [id]);
  return found.found ? (found as Dispute) : null;
}

// ── Reading a receipt ───────────────────────────────────────────────────────

interface Receipt {
  execution_result?: string;
  result?: { status?: string; payload?: unknown };
}

function leaderReceipt(tx: unknown): Receipt | null {
  const data = (tx as { consensus_data?: { leader_receipt?: Receipt[] } })?.consensus_data;
  return data?.leader_receipt?.[0] ?? null;
}

/**
 * The revert reason, or "".
 *
 * NOT in stderr — stderr and stdout both come back empty for a revert. The
 * message is the `payload` of the rollback result.
 */
function revertReasonOf(receipt: Receipt | null): string {
  const result = receipt?.result;
  if (!result || typeof result.payload !== "string") return "";
  return result.payload;
}

/**
 * What a successful call returned, decoded.
 *
 * The receipt spells the two outcomes differently: on a revert `result.payload`
 * is the reason as a bare string, on a success it is an object carrying the
 * value as `readable` — a JSON-encoded form of the return value. Reading
 * `payload` without checking which shape it is gets you "[object Object]".
 */
function returnValueOf(receipt: Receipt | null): string | null {
  const payload = receipt?.result?.payload;
  if (payload === null || payload === undefined) return null;
  if (typeof payload === "string") return payload;
  const readable = (payload as { readable?: unknown }).readable;
  if (typeof readable !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(readable);
    return typeof parsed === "string" ? parsed : readable;
  } catch {
    return readable;
  }
}

export interface WriteProgress {
  statusName: string | null;
  elapsedMs: number;
}

export interface WaitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: WriteProgress) => void;
}

/** Resolve and resolve-adjacent calls run a browser and a model; they are slow. */
export const RESOLVE_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Wait for a submitted write to settle, converting a revert back into a throw.
 *
 * Returns the decoded return value on success.
 */
export async function waitForWrite(
  account: `0x${string}`,
  hash: TransactionHash,
  { timeoutMs = DEFAULT_TIMEOUT_MS, signal, onProgress }: WaitOptions = {},
): Promise<string | null> {
  const read = getReadClient();
  const wallet = getWalletClient(account);
  const started = Date.now();
  const pollMs = chain.isStudio ? 1500 : 5000;
  let nudges = 0;

  for (;;) {
    if (signal?.aborted) throw new AbortError();

    const tx = await read.getTransaction({ hash }).catch(() => null);
    // The SDK's map is keyed by numeric-literal STRINGS, so a `number` index is
    // rejected outright. Narrowed here rather than cast at the read, so an
    // unknown status code lands as null instead of an untyped value.
    const statusCode = (tx as { status?: number } | null)?.status;
    const statusName =
      statusCode === undefined
        ? null
        : ((transactionsStatusNumberToName as Record<string, string | undefined>)[
            String(statusCode)
          ] ?? null);
    onProgress?.({ statusName, elapsedMs: Date.now() - started });

    if (statusName && TERMINAL_STATES.includes(statusName)) {
      if (statusName === "UNDETERMINED") {
        throw new Error(
          "The validators could not agree on a result. Nothing was changed and your stake was not taken — try again.",
        );
      }
      if (statusName === "CANCELED") throw new Error("The network canceled this transaction before it ran.");

      const receipt = leaderReceipt(tx);
      const reverted =
        receipt?.execution_result === "ERROR" ||
        (tx as { txExecutionResultName?: string })?.txExecutionResultName === "FINISHED_WITH_ERROR" ||
        receipt?.result?.status === "rollback";

      if (reverted) throw new Error(revertReasonOf(receipt) || "The contract rejected this transaction.");
      return returnValueOf(receipt);
    }

    // Bradbury parks transactions in an idle queue that needs a nudge to move.
    if (!chain.isStudio && Date.now() - started > (nudges + 1) * 45_000 && nudges < 10) {
      nudges++;
      await wallet.finalizeIdlenessTxs({ txIds: [hash] }).catch(() => {});
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error("This transaction has not settled yet. It may still land — check the docket in a minute.");
    }
    await sleep(pollMs);
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

async function send(
  account: `0x${string}`,
  functionName: string,
  args: Arg[],
  value = 0n,
): Promise<TransactionHash> {
  return (await getWalletClient(account).writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  })) as TransactionHash;
}

export const submitCreateDispute = (
  account: `0x${string}`,
  claimText: string,
  claimUrl: string,
  evidenceUrls: string,
  deadlineMinutes: number,
  stakeWei: bigint,
) => send(account, "create_dispute", [claimText, claimUrl, evidenceUrls, deadlineMinutes], stakeWei);

export const submitDefendDispute = (
  account: `0x${string}`,
  disputeId: number,
  evidenceUrls: string,
  stakeWei: bigint,
) => send(account, "defend_dispute", [disputeId, evidenceUrls], stakeWei);

export const submitResolve = (account: `0x${string}`, disputeId: number) =>
  send(account, "resolve_dispute", [disputeId]);

export const submitCancel = (account: `0x${string}`, disputeId: number) =>
  send(account, "cancel_dispute", [disputeId]);

export const submitExpire = (account: `0x${string}`, disputeId: number) =>
  send(account, "expire_dispute", [disputeId]);

export const submitSetPaused = (account: `0x${string}`, paused: boolean) =>
  send(account, "set_paused", [paused]);

export const submitSetParams = (
  account: `0x${string}`,
  feeBps: number,
  minStake: string,
  maxStake: string,
  windowSeconds: number,
) => send(account, "set_params", [feeBps, minStake, maxStake, windowSeconds]);

export const submitWithdrawFees = (account: `0x${string}`, to: string) =>
  send(account, "withdraw_fees", [to]);

export const submitSweep = (account: `0x${string}`, to: string, amount: string) =>
  send(account, "sweep_unallocated", [to, amount]);

/**
 * Parse what a payable write returned, and treat a refund as a failure.
 *
 * The transaction succeeding is not the same as the dispute being opened. When
 * ClaimStake turns a stake down it refunds and returns `{ok: false, reason}` on
 * a SUCCESSFUL transaction, so a caller that only checks the receipt would show
 * a confirmation for money that just came straight back.
 */
export function readWriteResult(returned: string | null): WriteResult {
  if (!returned) return { ok: true };
  try {
    const parsed = JSON.parse(returned) as WriteResult;
    if (parsed && typeof parsed === "object" && "ok" in parsed) return parsed;
  } catch {
    // Non-payable methods return a plain status string, not JSON.
  }
  return { ok: true, status: returned };
}

/** The user-facing wallet/submission failures worth their own wording. */
export function describeSubmitError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/User rejected|user denied|4001/i.test(message)) return "You dismissed the wallet prompt.";
  if (/insufficient funds/i.test(message)) {
    return "This wallet does not hold enough GEN to cover the stake.";
  }
  if (/chain|network mismatch|wrong chain/i.test(message)) {
    return "Your wallet is on the wrong network. Switch it and try again.";
  }
  if (/rate limit|-32029/i.test(message)) {
    return "The GenLayer RPC is rate limiting this deployment. Wait a minute and retry.";
  }
  return message || "The transaction could not be submitted.";
}
