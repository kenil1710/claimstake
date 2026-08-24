"use client";

import Link from "next/link";
import useSWR from "swr";
import { getOpenDisputes, getStats } from "@/lib/contract";
import { formatGen, formatRelative } from "@/lib/format";
import { DisputeCard, EmptyState, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { useNow } from "@/hooks/useNow";

/**
 * The market page: every dispute still missing a defender.
 *
 * Sorted by how soon the window shuts rather than by recency, because that is
 * the only thing that decides whether a seat is still takeable. A case with
 * four minutes left is a different proposition from one with two days, and
 * recency ordering hides exactly that.
 */
export default function OpenSeatsPage() {
  const { data, error, isLoading } = useSWR("open-seats", getOpenDisputes, { refreshInterval: 10_000 });
  const { data: stats } = useSWR("stats", getStats, { refreshInterval: 30_000 });

  // Ticks, so a seat that closes while the page is open moves to the lapsed
  // list on its own instead of staying takeable until someone reloads.
  // 0 until the first tick. Nothing is classified as lapsed before then, so a
  // takeable seat is never briefly shown as closed on first paint.
  const now = useNow(5_000);
  const takeable = (data ?? [])
    .filter((dispute) => now === 0 || dispute.join_deadline * 1000 > now)
    .sort((a, b) => a.join_deadline - b.join_deadline);
  const lapsed = (data ?? []).filter((dispute) => now > 0 && dispute.join_deadline * 1000 <= now);

  const atStake = takeable.reduce((total, dispute) => total + BigInt(dispute.challenger_stake), 0n);

  return (
    <>
      <PageHeader
        eyebrow="Disputes waiting for a defender"
        title="Open seats"
        lede="Match the challenger's stake exactly and the case goes to the validators. Soonest to close first."
        action={
          stats ? (
            <div style={{ textAlign: "right" }}>
              <div className="eyebrow">Seats open</div>
              <div className="amount" style={{ fontSize: "1.6rem", fontWeight: 600 }}>
                {takeable.length}
              </div>
              <div className="mono" style={{ fontSize: "0.75rem", color: "var(--gold)" }}>
                {formatGen(atStake)} GEN to match
              </div>
            </div>
          ) : null
        }
      />

      {error ? (
        <ErrorNote message={`Could not read open disputes: ${String((error as Error).message ?? error)}`} />
      ) : isLoading ? (
        <Loading />
      ) : takeable.length === 0 ? (
        <EmptyState
          title="No seats open"
          body="Every filed claim already has someone on the other side, or its window has closed. File one of your own and someone can take yours."
          action={
            <Link href="/new" className="btn">
              File a claim
            </Link>
          }
        />
      ) : (
        <div style={{ display: "grid", gap: "1.1rem", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {takeable.map((dispute) => (
            <div key={dispute.id}>
              <div
                className="eyebrow"
                style={{
                  marginBottom: "0.4rem",
                  color:
                    now > 0 && dispute.join_deadline * 1000 - now < 15 * 60_000
                      ? "var(--challenger)"
                      : "var(--ink-faint)",
                }}
              >
                {now > 0 ? `Closes ${formatRelative(dispute.join_deadline, now)} · ` : ""}
                match {formatGen(dispute.challenger_stake)} GEN
              </div>
              <DisputeCard dispute={dispute} />
            </div>
          ))}
        </div>
      )}

      {lapsed.length > 0 ? (
        <section style={{ marginTop: "3rem" }}>
          <h2 className="display" style={{ fontSize: "1.5rem", marginBottom: "0.4rem" }}>
            Past their window
          </h2>
          <p style={{ color: "var(--ink-soft)", marginBottom: "1.25rem", maxWidth: "60ch", fontSize: "0.95rem" }}>
            Nobody took these in time, so they can no longer be defended. Anyone can close one out and the
            challenger&rsquo;s stake goes back to them — you do not have to be a party to do it.
          </p>
          <div style={{ display: "grid", gap: "1.1rem", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {lapsed.map((dispute) => (
              <DisputeCard key={dispute.id} dispute={dispute} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
