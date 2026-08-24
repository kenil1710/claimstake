"use client";

import Link from "next/link";
import type { DisputeStatus, DisputeSummary, Verdict } from "@/types";
import { formatEpoch, formatGen, formatRelative, hostOf, shortAddress } from "@/lib/format";
import { Seam } from "./Seam";
import { useNow } from "@/hooks/useNow";

/** Status colour is semantic: it names a party, or names the absence of one. */
const STATUS_TONE: Record<DisputeStatus, string> = {
  OPEN: "var(--gold)",
  ACTIVE: "var(--ink)",
  RESOLVED: "var(--ink)",
  EXPIRED: "var(--neutral)",
  CANCELED: "var(--neutral)",
};

const VERDICT_TONE: Record<string, string> = {
  TRUE: "var(--defender)",
  FALSE: "var(--challenger)",
  INCONCLUSIVE: "var(--neutral)",
};

export function StatusChip({ status }: { status: DisputeStatus }) {
  return (
    <span className="chip" style={{ color: STATUS_TONE[status] }}>
      {status}
    </span>
  );
}

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  if (!verdict) return null;
  return (
    <span
      className="chip"
      style={{ color: "#fff", background: VERDICT_TONE[verdict], borderColor: VERDICT_TONE[verdict] }}
    >
      {verdict}
    </span>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  action?: React.ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "1.5rem",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingBottom: "1.25rem",
        marginBottom: "1.75rem",
        borderBottom: "1.5px solid var(--ink)",
      }}
    >
      <div style={{ maxWidth: "46ch" }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 5vw, 3.1rem)", marginTop: "0.35rem" }}>
          {title}
        </h1>
        {lede ? (
          <p style={{ color: "var(--ink-soft)", marginTop: "0.7rem", fontSize: "1.02rem" }}>{lede}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

/** A dispute as it appears in any list. The seam does the heavy lifting. */
export function DisputeCard({ dispute }: { dispute: DisputeSummary }) {
  const now = useNow(30_000);
  // now === 0 before the first tick; treat that as "not yet known" rather than
  // as 1970, which would mark every open dispute as closed on first paint.
  const deadlinePassed = now > 0 && dispute.join_deadline * 1000 < now;
  return (
    <Link
      href={`/dispute/${dispute.id}`}
      className="sheet"
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          padding: "0.7rem 0.9rem",
          borderBottom: "1px solid var(--rule)",
          flexWrap: "wrap",
        }}
      >
        <span className="mono" style={{ fontSize: "0.75rem", color: "var(--ink-faint)" }}>
          #{String(dispute.id).padStart(3, "0")}
        </span>
        <StatusChip status={dispute.status} />
        <VerdictChip verdict={dispute.verdict} />
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: "0.7rem", color: "var(--ink-faint)" }}>
          {dispute.claim_domain || hostOf(dispute.claim_url)}
        </span>
      </div>

      <p
        style={{
          padding: "0.95rem 0.9rem",
          fontSize: "1.06rem",
          lineHeight: 1.42,
          fontFamily: "var(--font-display)",
        }}
      >
        {dispute.claim_text}
      </p>

      <Seam dispute={dispute} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          padding: "0.55rem 0.9rem",
          borderTop: "1px solid var(--rule)",
          fontSize: "0.75rem",
          color: "var(--ink-faint)",
          flexWrap: "wrap",
        }}
      >
        <span className="mono">pot {formatGen(dispute.pot)} GEN</span>
        <span className="mono">
          {dispute.status === "OPEN"
            ? deadlinePassed
              ? "window closed — refundable"
              : now === 0
                ? "open"
                : `closes ${formatRelative(dispute.join_deadline, now)}`
            : formatEpoch(dispute.created_epoch)}
        </span>
      </div>
    </Link>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div
      className="hairline"
      style={{
        padding: "3rem 1.5rem",
        textAlign: "center",
        background: "var(--field-raised)",
      }}
    >
      <p className="display" style={{ fontSize: "1.5rem" }}>
        {title}
      </p>
      <p style={{ color: "var(--ink-soft)", margin: "0.6rem auto 1.2rem", maxWidth: "44ch" }}>{body}</p>
      {action}
    </div>
  );
}

export function Loading({ label = "Reading the chain" }: { label?: string }) {
  return (
    <p className="eyebrow" style={{ padding: "2.5rem 0", textAlign: "center" }}>
      {label}…
    </p>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div
      style={{
        border: "1.5px solid var(--challenger)",
        background: "var(--challenger-wash)",
        color: "var(--challenger)",
        padding: "0.85rem 1rem",
        fontSize: "0.9rem",
      }}
    >
      {message}
    </div>
  );
}

export function AddressTag({ address, label }: { address: string; label?: string }) {
  return (
    <span className="mono" style={{ fontSize: "0.8rem" }}>
      {label ? <span style={{ color: "var(--ink-faint)" }}>{label} </span> : null}
      {shortAddress(address)}
    </span>
  );
}

/** A labelled figure. Used in rows so numbers align across the whole page. */
export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className="amount"
        style={{ fontSize: "1.35rem", fontWeight: 600, marginTop: "0.15rem", color: tone ?? "var(--ink)" }}
      >
        {value}
      </div>
    </div>
  );
}
