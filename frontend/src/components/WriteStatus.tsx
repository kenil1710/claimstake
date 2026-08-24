"use client";

import type { WriteState } from "@/hooks/useContractWrite";
import { formatGen } from "@/lib/format";
import { explorerUrl } from "@/lib/genlayer";

/**
 * Narrates a write honestly, including the outcome most interfaces get wrong.
 *
 * A refund is not an error and not a success. The transaction did exactly what
 * it should, the contract declined the input, and the money is already back.
 * Saying "failed" would send someone hunting for a problem with their wallet;
 * saying "done" would leave them thinking they hold a position they do not.
 */
export function WriteStatus({ state }: { state: WriteState }) {
  if (state.phase === "idle") return null;

  const shell: React.CSSProperties = {
    padding: "0.8rem 1rem",
    fontSize: "0.9rem",
    border: "1.5px solid var(--ink)",
    background: "var(--field-raised)",
    display: "flex",
    gap: "0.75rem",
    alignItems: "baseline",
    flexWrap: "wrap",
  };

  if (state.phase === "signing") {
    return (
      <div style={shell}>
        <span className="eyebrow">Waiting on wallet</span>
        <span>Confirm the transaction in your wallet.</span>
      </div>
    );
  }

  if (state.phase === "waiting" || state.phase === "settling") {
    const seconds = state.phase === "waiting" ? Math.round(state.elapsedMs / 1000) : null;
    return (
      <div style={shell}>
        <span className="eyebrow">On chain</span>
        <span>
          {state.phase === "settling"
            ? "Accepted. Re-reading the docket…"
            : "Validators are running the claim. This takes a moment."}
        </span>
        <span style={{ flex: 1 }} />
        <a
          className="mono link-underline"
          href={explorerUrl("tx", state.hash)}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: "0.75rem", color: "var(--ink-faint)" }}
        >
          {seconds !== null ? `${seconds}s` : ""} view tx
        </a>
      </div>
    );
  }

  if (state.phase === "refunded") {
    return (
      <div
        style={{
          ...shell,
          borderColor: "var(--gold)",
          background: "color-mix(in srgb, var(--gold) 10%, var(--field-raised))",
        }}
      >
        <span className="eyebrow" style={{ color: "var(--gold)" }}>
          Declined · refunded
        </span>
        <span>
          {state.reason}. Your {formatGen(state.refunded)} GEN was sent straight back — nothing was staked.
        </span>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div
        style={{ ...shell, borderColor: "var(--challenger)", background: "var(--challenger-wash)", color: "var(--challenger)" }}
      >
        <span className="eyebrow" style={{ color: "inherit" }}>
          Stopped
        </span>
        <span>{state.message}</span>
      </div>
    );
  }

  return (
    <div style={{ ...shell, borderColor: "var(--defender)", background: "var(--defender-wash)", color: "var(--defender)" }}>
      <span className="eyebrow" style={{ color: "inherit" }}>
        Settled
      </span>
      <span>{state.message}</span>
      <span style={{ flex: 1 }} />
      <a
        className="mono link-underline"
        href={explorerUrl("tx", state.hash)}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: "0.75rem", color: "inherit" }}
      >
        view tx
      </a>
    </div>
  );
}
