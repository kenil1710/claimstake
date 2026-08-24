"use client";

import Link from "next/link";
import type { DisputeStatus, DisputeSummary, Verdict } from "@/types";
import { formatGen, formatRelative, hostOf, shortAddress } from "@/lib/format";
import { useNow } from "@/hooks/useNow";
import { Matchup } from "@/components/Meter";

/**
 * Status is about where a dispute is in its life; verdict is about how it
 * ended. They are separate chips because a RESOLVED dispute needs to say both,
 * and collapsing them into one label loses the distinction between "nobody
 * defended it" and "a validator said the claim held up".
 */
const STATUS_STYLE: Record<DisputeStatus, { label: string; color: string }> = {
  OPEN: { label: "Seat open", color: "var(--text)" },
  ACTIVE: { label: "Under review", color: "var(--text)" },
  RESOLVED: { label: "Settled", color: "var(--text-dim)" },
  EXPIRED: { label: "Expired", color: "var(--text-faint)" },
  CANCELED: { label: "Withdrawn", color: "var(--text-faint)" },
};

export function StatusChip({ status }: { status: DisputeStatus }) {
  const style = STATUS_STYLE[status] ?? { label: status, color: "var(--text-dim)" };
  return (
    <span className="chip" style={{ color: style.color }}>
      {style.label}
    </span>
  );
}

/** The verdict is the claim's fate, so it wears the winning side's colour. */
export function VerdictChip({ verdict }: { verdict: Verdict }) {
  if (!verdict) return null;
  const tone =
    verdict === "FALSE"
      ? { bg: "var(--challenger)", fg: "#14090a" }
      : verdict === "TRUE"
        ? { bg: "var(--defender)", fg: "#04140e" }
        : { bg: "var(--neutral)", fg: "#0a0b0e" };
  return (
    <span className="chip chip-solid" style={{ background: tone.bg, color: tone.fg }}>
      {verdict}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  action?: React.ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: "1.5rem",
        flexWrap: "wrap",
        marginBottom: "2rem",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow ? <div className="eyebrow" style={{ marginBottom: "0.7rem" }}>{eyebrow}</div> : null}
        <h1 className="display-black" style={{ fontSize: "clamp(2rem, 5vw, 3.1rem)" }}>
          {title}
        </h1>
        {lede ? (
          <p className="lede" style={{ marginTop: "0.85rem", maxWidth: "56ch" }}>
            {lede}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function DisputeCard({ dispute }: { dispute: DisputeSummary }) {
  const now = useNow(5_000);
  const closing = dispute.status === "OPEN" && now > 0 ? formatRelative(dispute.join_deadline, now) : null;
  const overdue = dispute.status === "OPEN" && now > 0 && dispute.join_deadline * 1000 <= now;

  return (
    <Link
      href={`/dispute/${dispute.id}`}
      className="card card-hover"
      style={{
        display: "block",
        padding: "1.1rem 1.1rem 1.25rem",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "0.85rem",
        }}
      >
        <span className="num" style={{ fontSize: "0.75rem", color: "var(--text-faint)", fontWeight: 600 }}>
          #{String(dispute.id).padStart(3, "0")}
        </span>
        <StatusChip status={dispute.status} />
        <VerdictChip verdict={dispute.verdict} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: "0.7rem", color: "var(--text-faint)" }}>
          {hostOf(dispute.claim_url)}
        </span>
      </div>

      <p
        className="clamp-3"
        style={{
          fontSize: "1rem",
          lineHeight: 1.45,
          fontWeight: 500,
          marginBottom: "1.1rem",
          minHeight: "2.9em",
        }}
      >
        {dispute.claim_text}
      </p>

      <Matchup dispute={dispute} height="2.5rem" />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginTop: "0.85rem",
          fontSize: "0.75rem",
          color: "var(--text-faint)",
        }}
      >
        <span className="num">pot {formatGen(dispute.pot)} GEN</span>
        {closing ? (
          <span className="num" style={{ color: overdue ? "var(--text-faint)" : "var(--text-dim)" }}>
            {overdue ? "window closed" : `closes ${closing}`}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "3rem 1.5rem",
        textAlign: "center",
        display: "grid",
        gap: "0.6rem",
        justifyItems: "center",
      }}
    >
      <h2 className="display" style={{ fontSize: "1.4rem" }}>
        {title}
      </h2>
      <p style={{ color: "var(--text-dim)", maxWidth: "46ch", fontSize: "0.95rem" }}>{body}</p>
      {action ? <div style={{ marginTop: "0.75rem" }}>{action}</div> : null}
    </div>
  );
}

export function Loading({ label = "Reading the chain" }: { label?: string }) {
  return (
    <div
      style={{
        padding: "3.5rem 1rem",
        textAlign: "center",
        color: "var(--text-faint)",
        fontSize: "0.9rem",
      }}
    >
      {label}…
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div
      className="card"
      style={{
        padding: "1rem 1.15rem",
        borderColor: "var(--challenger-dim)",
        background: "var(--challenger-wash)",
      }}
    >
      <div className="eyebrow" style={{ color: "var(--challenger)", marginBottom: "0.3rem" }}>
        Could not load
      </div>
      <p style={{ fontSize: "0.92rem" }}>{message}</p>
    </div>
  );
}

export function AddressTag({ address, label }: { address: string; label?: string }) {
  return (
    <span style={{ display: "inline-flex", gap: "0.45rem", alignItems: "baseline" }}>
      {label ? <span className="eyebrow">{label}</span> : null}
      <span className="num" style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
        {shortAddress(address)}
      </span>
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: "0.35rem" }}>
        {label}
      </div>
      <div className="amount" style={{ fontSize: "1.35rem", color: tone ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}
