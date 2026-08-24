"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { getRecentDisputes } from "@/lib/contract";
import { DisputeCard, EmptyState, ErrorNote, Loading, PageHeader } from "@/components/ui";
import type { DisputeStatus } from "@/types";

const FILTERS: Array<{ key: DisputeStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "Everything" },
  { key: "OPEN", label: "Seat open" },
  { key: "ACTIVE", label: "Under review" },
  { key: "RESOLVED", label: "Settled" },
  { key: "EXPIRED", label: "Expired" },
  { key: "CANCELED", label: "Withdrawn" },
];

export default function DocketPage() {
  const [filter, setFilter] = useState<DisputeStatus | "ALL">("ALL");
  const { data, error, isLoading } = useSWR("docket", () => getRecentDisputes(100), {
    refreshInterval: 15_000,
  });

  const shown = useMemo(
    () => (data ?? []).filter((dispute) => filter === "ALL" || dispute.status === filter),
    [data, filter],
  );

  const counts = useMemo(() => {
    const tally: Record<string, number> = { ALL: data?.length ?? 0 };
    for (const dispute of data ?? []) tally[dispute.status] = (tally[dispute.status] ?? 0) + 1;
    return tally;
  }, [data]);

  return (
    <>
      <PageHeader
        eyebrow="Every case, newest first"
        title="The docket"
        lede="Each bar shows where the money sits. Centred means the case is still live; shifted means a verdict landed and took the pot with it."
        action={
          <Link href="/new" className="btn">
            File a claim
          </Link>
        }
      />

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.75rem" }}>
        {FILTERS.map((option) => {
          const active = filter === option.key;
          const count = counts[option.key] ?? 0;
          return (
            <button
              key={option.key}
              onClick={() => setFilter(option.key)}
              aria-pressed={active}
              className="chip"
              style={{
                cursor: "pointer",
                background: active ? "var(--ink)" : "transparent",
                color: active ? "var(--field-raised)" : "var(--ink-soft)",
                borderColor: active ? "var(--ink)" : "var(--rule-strong)",
                padding: "0.35rem 0.7rem",
                fontSize: "0.66rem",
              }}
            >
              {option.label} {count ? `· ${count}` : ""}
            </button>
          );
        })}
      </div>

      {error ? (
        <ErrorNote message={`Could not read the docket: ${String((error as Error).message ?? error)}`} />
      ) : isLoading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <EmptyState
          title={data?.length ? "Nothing under that filter" : "The docket is empty"}
          body={
            data?.length
              ? "No case is in that state right now. Try another filter."
              : "No claims have been disputed yet. The first one sets the tone."
          }
          action={
            <Link href="/new" className="btn">
              File the first claim
            </Link>
          }
        />
      ) : (
        <div style={{ display: "grid", gap: "1.1rem", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {shown.map((dispute) => (
            <DisputeCard key={dispute.id} dispute={dispute} />
          ))}
        </div>
      )}
    </>
  );
}
