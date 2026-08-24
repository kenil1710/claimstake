"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  AbortError,
  describeSubmitError,
  readWriteResult,
  waitForWrite,
  type TransactionHash,
} from "@/lib/contract";

export type WriteState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "waiting"; hash: TransactionHash; statusName: string | null; elapsedMs: number }
  | { phase: "settling"; hash: TransactionHash }
  | { phase: "done"; hash: TransactionHash; message: string }
  /**
   * The contract took the call, turned the input down, and sent the money back.
   * Its own phase because it is neither a success nor a failure to submit: the
   * transaction worked perfectly and the stake is already back in the wallet.
   * Showing it as an error would imply something needs retrying blindly; showing
   * it as a success would be a lie about where the money is.
   */
  | { phase: "refunded"; hash: TransactionHash; reason: string; refunded: string }
  | { phase: "error"; message: string; hash: TransactionHash | null };

export interface RunOptions {
  timeoutMs?: number;
  /** Runs after a genuine success, before `done`. Re-read views here. */
  onAccepted?: (hash: TransactionHash) => Promise<void> | void;
  /** Wording for the success toast. */
  successMessage?: string;
}

/**
 * Drives one contract write and reports what it is doing.
 *
 * Three outcomes, not two. A ClaimStake payable method answers bad input with a
 * SUCCESSFUL transaction that refunds — reverting would keep the caller's stake
 * — so "the transaction settled" does not mean "the dispute was opened". This
 * hook separates those, and the UI must too.
 */
export function useContractWrite() {
  const { account, refreshBalance } = useWallet();
  const [state, setState] = useState<WriteState>({ phase: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const run = useCallback(
    async (
      submit: (account: `0x${string}`) => Promise<TransactionHash>,
      { timeoutMs, onAccepted, successMessage = "Done." }: RunOptions = {},
    ): Promise<boolean> => {
      if (!account) {
        setState({ phase: "error", message: "Connect your wallet to send this transaction.", hash: null });
        return false;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ phase: "signing" });

      let hash: TransactionHash;
      try {
        hash = await submit(account);
      } catch (error) {
        setState({ phase: "error", message: describeSubmitError(error), hash: null });
        return false;
      }

      try {
        const returned = await waitForWrite(account, hash, {
          timeoutMs,
          signal: controller.signal,
          onProgress: ({ statusName, elapsedMs }) =>
            setState({ phase: "waiting", hash, statusName, elapsedMs }),
        });

        const result = readWriteResult(returned);
        if (result.ok === false) {
          void refreshBalance();
          setState({ phase: "refunded", hash, reason: result.reason, refunded: result.refunded });
          return false;
        }

        if (onAccepted) {
          setState({ phase: "settling", hash });
          await onAccepted(hash);
        }
        void refreshBalance();
        setState({ phase: "done", hash, message: successMessage });
        return true;
      } catch (error) {
        if (error instanceof AbortError || controller.signal.aborted) return false;
        setState({
          phase: "error",
          message: error instanceof Error ? error.message : "The transaction did not settle.",
          hash,
        });
        return false;
      }
    },
    [account, refreshBalance],
  );

  const busy = state.phase === "signing" || state.phase === "waiting" || state.phase === "settling";
  return { state, run, reset, busy };
}
