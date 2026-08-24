"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { getRecentDisputes } from "@/lib/contract";
import { DisputeCard, EmptyState, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/Motion";
import type { DisputeSummary } from "@/types";

/**
 * Every case, newest first.
 *
 * The filters are counted from the loaded rows rather than queried separately:
 * one read of the docket answers all of them, and a count that disagrees with
 * the list below it is worse than no count at all.
 */
type Filter = { key: string; label: string; match: (d: DisputeSummary) => boolean };

const FILTERS: Filter[] = [
  { key: "all", label: "Everything", match: () => true },
  { key: "open", label: "Seat open", match: (d) => d.status === "OPEN" },
  { key: "active", label: "Under review", match: (d) => d.status === "ACTIVE" },
  { key: "resolved", label: "Settled", match: (d) => d.status === "RESOLVED" },
  { key: "expired", label: "Expired", match: (d) => d.status === "EXPIRED" },
  { key: "canceled", label: "Withdrawn", match: (d) => d.status === "CANCELED" },
];

export default function DocketPage() {
  const [filter, setFilter] = useState("all");
  const { data, error, isLoading } = useSWR("docket", () => getRecentDisputes(100), {
    refreshInterval: 15_000,
  });

  const counts = useMemo(() => {
    const rows = data ?? [];
    return Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter(f.match).length]));
  }, [data]);

  const shown = useMemo(() => {
    const rows = data ?? [];
    const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
    return rows.filter(active.match);
  }, [data, filter]);

  return (
    <>
      <PageHeader
        eyebrow="Every case, newest first"
        title="The docket"
        lede="Each bar shows where the money sits. Centred means the case is still live; shifted means a verdict landed and took the pot with it."
        action={
          <Link href="/challenge" className="btn">
            File a challenge
          </Link>
        }
      />

      {error ? <ErrorNote message="Could not read the docket from the contract." /> : null}

      <div
        className="scroll-x"
        style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem", paddingBottom: "0.35rem" }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = counts[f.key] ?? 0;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="chip"
              style={{
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: active ? "var(--text)" : "transparent",
                color: active ? "var(--void)" : "var(--text-dim)",
                borderColor: active ? "var(--text)" : "var(--line-bright)",
                transition: "background 150ms ease, color 150ms ease, border-color 150ms ease",
              }}
            >
              {f.label} · {count}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Loading label="Reading the docket" />
      ) : shown.length === 0 ? (
        <EmptyState
          title={data?.length ? "Nothing under this filter" : "The docket is empty"}
          body={
            data?.length
              ? "No case is in that state right now. Try another filter."
              : "No claims have been filed against this contract yet. Be the first to put money behind one."
          }
          action={
            <Link href="/challenge" className="btn">
              File a challenge
            </Link>
          }
        />
      ) : (
        <Stagger
          gap={0.05}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {shown.map((dispute) => (
            <StaggerItem key={dispute.id}>
              <DisputeCard dispute={dispute} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  );
}
