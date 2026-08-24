"use client";

import type { WriteState } from "@/hooks/useContractWrite";
import { formatGen } from "@/lib/format";
import { explorerUrl } from "@/lib/genlayer";

/**
 * Narrates a write honestly, including the outcome most interfaces get wrong.
 *
 * A refund is NOT an error and NOT a success. The transaction did exactly what
 * it should, the contract declined the input, and the money is already back in
 * the wallet. Calling it "failed" sends someone hunting for a problem with
 * their wallet that does not exist; calling it "done" leaves them believing
 * they hold a position they do not. So it gets its own state and its own
 * colour — neither red nor green, because it belongs to neither side.
 */
export function WriteStatus({ state }: { state: WriteState }) {
  if (state.phase === "idle") return null;

  const shell: React.CSSProperties = {
    padding: "0.85rem 1rem",
    fontSize: "0.9rem",
    border: "1px solid var(--line-bright)",
    background: "var(--surface-2)",
    display: "flex",
    gap: "0.75rem",
    alignItems: "baseline",
    flexWrap: "wrap",
  };

  const txLink = (hash: string, color: string) => (
    <a
      className="num link-u"
      href={explorerUrl("tx", hash)}
      target="_blank"
      rel="noreferrer noopener"
      style={{ fontSize: "0.75rem", color }}
    >
      view transaction
    </a>
  );

  if (state.phase === "signing") {
    return (
      <div style={shell}>
        <span className="eyebrow">Waiting on wallet</span>
        <span style={{ color: "var(--text-dim)" }}>Confirm the transaction in your wallet.</span>
      </div>
    );
  }

  if (state.phase === "waiting" || state.phase === "settling") {
    const seconds = state.phase === "waiting" ? Math.round(state.elapsedMs / 1000) : null;
    return (
      <div style={shell}>
        <span className="eyebrow">On chain</span>
        <span style={{ color: "var(--text-dim)" }}>
          {state.phase === "settling"
            ? "Accepted. Re-reading the docket…"
            : "Validators are reading the claim. This takes a moment."}
        </span>
        <span style={{ flex: 1 }} />
        {seconds !== null ? (
          <span className="num" style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>
            {seconds}s
          </span>
        ) : null}
        {txLink(state.hash, "var(--text-faint)")}
      </div>
    );
  }

  if (state.phase === "refunded") {
    return (
      <div
        style={{
          ...shell,
          borderColor: "var(--neutral)",
          background: "var(--neutral-wash)",
        }}
      >
        <span className="eyebrow" style={{ color: "var(--text)" }}>
          Declined · refunded
        </span>
        <span style={{ color: "var(--text-dim)" }}>
          {state.reason}. Your {formatGen(state.refunded)} GEN went straight back — nothing was staked.
        </span>
        <span style={{ flex: 1 }} />
        {txLink(state.hash, "var(--text-faint)")}
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div
        style={{
          ...shell,
          borderColor: "var(--challenger-dim)",
          background: "var(--challenger-wash)",
        }}
      >
        <span className="eyebrow" style={{ color: "var(--challenger)" }}>
          Stopped
        </span>
        <span style={{ color: "var(--text)" }}>{state.message}</span>
        {state.hash ? (
          <>
            <span style={{ flex: 1 }} />
            {txLink(state.hash, "var(--text-faint)")}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        ...shell,
        borderColor: "var(--defender-dim)",
        background: "var(--defender-wash)",
      }}
    >
      <span className="eyebrow" style={{ color: "var(--defender)" }}>
        Settled
      </span>
      <span style={{ color: "var(--text)" }}>{state.message}</span>
      <span style={{ flex: 1 }} />
      {txLink(state.hash, "var(--text-faint)")}
    </div>
  );
}
