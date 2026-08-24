"use client";

import Link from "next/link";
import useSWR from "swr";
import { getOpenDisputes, getStats } from "@/lib/contract";
import { EmptyState, ErrorNote, Loading, PageHeader, StatusChip } from "@/components/ui";
import { Matchup } from "@/components/Meter";
import { Stagger, StaggerItem } from "@/components/Motion";
import { formatGen, formatRelative, hostOf } from "@/lib/format";
import { useNow } from "@/hooks/useNow";
import type { DisputeSummary } from "@/types";

/**
 * Claims with nobody on the other side yet.
 *
 * Distinct from the docket because the question here is not "what happened"
 * but "what can I take". Every row leads straight to the defend form rather
 * than to the record, and the deadline is the most prominent thing on it —
 * an open seat is only worth anything until the window closes.
 */
export default function OpenSeatsPage() {
  const { data, error, isLoading } = useSWR("open-seats", getOpenDisputes, { refreshInterval: 10_000 });
  const { data: stats } = useSWR("stats", getStats, { refreshInterval: 30_000 });
  const now = useNow(1_000);

  const live = (data ?? []).filter((d) => now === 0 || d.join_deadline * 1000 > now);

  return (
    <>
      <PageHeader
        eyebrow="Waiting for a defender"
        title="Open seats"
        lede="Someone has staked against each of these. Match the stake exactly to take the other side — you are betting the claim holds up."
        action={
          <Link href="/challenge" className="btn btn-ghost">
            File a challenge
          </Link>
        }
      />

      {stats?.paused ? (
        <div
          className="card"
          style={{
            padding: "0.9rem 1.1rem",
            marginBottom: "1.5rem",
            borderColor: "var(--challenger-dim)",
            background: "var(--challenger-wash)",
          }}
        >
          <span className="eyebrow" style={{ color: "var(--challenger)" }}>
            Paused
          </span>{" "}
          <span style={{ fontSize: "0.9rem" }}>
            New stakes are on hold. Existing ones can still be withdrawn.
          </span>
        </div>
      ) : null}

      {error ? <ErrorNote message="Could not read open seats from the contract." /> : null}

      {isLoading ? (
        <Loading label="Looking for open seats" />
      ) : live.length === 0 ? (
        <EmptyState
          title="No open seats"
          body="Every filed claim has either been matched or run out its window. File one of your own and someone can take the other side."
          action={
            <Link href="/challenge" className="btn">
              File a challenge
            </Link>
          }
        />
      ) : (
        <Stagger gap={0.05} style={{ display: "grid", gap: "1.25rem" }}>
          {live.map((dispute) => (
            <StaggerItem key={dispute.id}>
              <OpenRow dispute={dispute} paused={stats?.paused ?? false} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  );
}

function OpenRow({ dispute, paused }: { dispute: DisputeSummary; paused: boolean }) {
  const now = useNow(1_000);
  const closes = now > 0 ? formatRelative(dispute.join_deadline, now) : "—";

  return (
    <div className="card card-hover" style={{ padding: "1.35rem" }}>
      <div className="row-2">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.7rem" }}>
            <span className="num" style={{ fontSize: "0.75rem", color: "var(--text-faint)", fontWeight: 600 }}>
              #{String(dispute.id).padStart(3, "0")}
            </span>
            <StatusChip status={dispute.status} />
            <span style={{ fontSize: "0.7rem", color: "var(--text-faint)" }}>
              {hostOf(dispute.claim_url)}
            </span>
          </div>

          <Link
            href={`/dispute/${dispute.id}`}
            className="display"
            style={{
              fontSize: "1.2rem",
              lineHeight: 1.3,
              display: "block",
              textDecoration: "none",
              color: "var(--text)",
              marginBottom: "1rem",
            }}
          >
            {dispute.claim_text}
          </Link>

          <Matchup dispute={dispute} height="2.25rem" />
        </div>

        <div style={{ display: "grid", gap: "0.85rem" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: "0.3rem" }}>
              To take this seat
            </div>
            <div className="amount" style={{ fontSize: "1.7rem", color: "var(--defender)" }}>
              {formatGen(dispute.challenger_stake)}{" "}
              <span style={{ fontSize: "0.8rem", opacity: 0.7, fontWeight: 600 }}>GEN</span>
            </div>
            <div className="num" style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>
              closes {closes}
            </div>
          </div>

          <Link
            href={`/defend/${dispute.id}`}
            className="btn btn-defender"
            style={{ pointerEvents: paused ? "none" : undefined, opacity: paused ? 0.4 : 1 }}
            aria-disabled={paused}
          >
            Defend this claim
          </Link>
        </div>
      </div>
    </div>
  );
}
