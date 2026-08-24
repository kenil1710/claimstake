"use client";

import Link from "next/link";
import useSWR from "swr";
import { getOpenDisputes, getRecentDisputes, getStats } from "@/lib/contract";
import { formatBps, formatGen } from "@/lib/format";
import { Seam } from "@/components/Seam";
import { DisputeCard, Eyebrow, Loading } from "@/components/ui";
import type { DisputeSummary } from "@/types";

/**
 * The hero is the mechanism, not a slogan.
 *
 * A worked example of one real dispute sits at the top with the seam under it,
 * because the seam is the thing a visitor has to learn to read — every list on
 * every other page is the same device repeated. Teaching it once, large, with a
 * live dispute in it, does more than any amount of explanation underneath.
 */

const SPECIMEN: DisputeSummary = {
  id: 0,
  challenger: "0x0000000000000000000000000000000000000000",
  defender: "0x0000000000000000000000000000000000000000",
  claim_text: "Gold has the chemical symbol Ag and atomic number 47.",
  claim_url: "https://example.org/element-sheet",
  claim_domain: "example.org",
  challenger_stake: "100000000000000000",
  defender_stake: "100000000000000000",
  pot: "200000000000000000",
  status: "RESOLVED",
  verdict: "FALSE",
  created_epoch: 0,
  join_deadline: 0,
};

export default function HomePage() {
  const { data: stats } = useSWR("stats", getStats, { refreshInterval: 20_000 });
  const { data: open } = useSWR("open", getOpenDisputes, { refreshInterval: 20_000 });
  const { data: recent } = useSWR("recent-6", () => getRecentDisputes(6), { refreshInterval: 20_000 });

  return (
    <>
      <section style={{ marginBottom: "4rem" }}>
        <Eyebrow>Adversarial fact-checking, settled on chain</Eyebrow>
        <h1
          className="display"
          style={{ fontSize: "clamp(2.4rem, 7vw, 4.6rem)", margin: "0.6rem 0 1.1rem", maxWidth: "18ch" }}
        >
          Someone published it. Someone else will bet it&rsquo;s wrong.
        </h1>
        <p style={{ fontSize: "1.12rem", color: "var(--ink-soft)", maxWidth: "58ch", marginBottom: "2rem" }}>
          Quote a claim from a live page and stake against it. Anyone can match your stake to defend it.
          A validator network reads the source, weighs both sides&rsquo; evidence, and the pot goes to
          whoever was right.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "2.75rem" }}>
          <Link href="/new" className="btn">
            File a claim
          </Link>
          <Link href="/docket/open" className="btn btn-ghost">
            Take the other side{open?.length ? ` (${open.length})` : ""}
          </Link>
        </div>

        {/* The specimen. Labelled as one so it is never mistaken for live data. */}
        <div className="sheet" style={{ maxWidth: "760px" }}>
          <div
            style={{
              padding: "0.6rem 0.9rem",
              borderBottom: "1px solid var(--rule)",
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <span className="eyebrow">How to read a dispute</span>
            <span className="eyebrow">Specimen — not a live case</span>
          </div>
          <p style={{ padding: "1.1rem 0.9rem 1rem", fontFamily: "var(--font-display)", fontSize: "1.5rem", lineHeight: 1.25 }}>
            {SPECIMEN.claim_text}
          </p>
          <Seam dispute={SPECIMEN} settle height="5.5rem" />
          <p style={{ padding: "0.8rem 0.9rem", fontSize: "0.9rem", color: "var(--ink-soft)", borderTop: "1px solid var(--rule)" }}>
            The bar is the whole story. Two equal stakes hold it at the centre while a dispute is live.
            When a verdict lands it shifts to the winner — here the challenger was right, so the red side
            takes the field. Gold is silver&rsquo;s symbol, not gold&rsquo;s.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: "4rem" }}>
        <h2 className="display" style={{ fontSize: "1.9rem", marginBottom: "1.25rem" }}>
          How a case runs
        </h2>
        {/* Numbered because this genuinely is a sequence — each step cannot
            happen before the one above it, and the contract enforces that. */}
        <ol style={{ display: "grid", gap: "1px", background: "var(--rule)", border: "1.5px solid var(--ink)", listStyle: "none" }}>
          {[
            ["Quote it", "Paste the URL and the exact sentence you think is wrong. The contract fetches the page and pins a hash of it, so nobody can quietly edit their way out."],
            ["Stake against it", "Your stake sets the price of the seat. A defender has to match it exactly — no asymmetric bets, no whales pushing small challengers around."],
            ["Someone takes the seat", "Until the window closes, anyone can match your stake to defend the claim. If nobody does, you get every wei back."],
            ["Validators read the source", "Several validators independently render the page, weigh both sides' filed evidence, and must agree on the verdict before it counts."],
            ["The pot moves", "Winner takes the pot minus the protocol fee. If the claim turns out to be opinion or the evidence is too thin, it settles inconclusive and both sides are refunded in full."],
          ].map(([title, body], index) => (
            <li key={title} style={{ background: "var(--field-raised)", padding: "1.1rem 1.15rem", display: "flex", gap: "1.1rem" }}>
              <span className="mono" style={{ color: "var(--ink-faint)", fontSize: "0.8rem", paddingTop: "0.2rem" }}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: "1.02rem", marginBottom: "0.25rem" }}>{title}</h3>
                <p style={{ color: "var(--ink-soft)", fontSize: "0.94rem" }}>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {stats ? (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "1px",
            background: "var(--rule)",
            border: "1.5px solid var(--ink)",
            marginBottom: "4rem",
          }}
        >
          {[
            ["Disputes filed", String(stats.total)],
            ["Settled", String(stats.resolved)],
            ["Staked to date", `${formatGen(stats.total_volume)} GEN`],
            ["Paid out", `${formatGen(stats.total_paid)} GEN`],
            ["Protocol fee", formatBps(stats.protocol_fee_bps)],
          ].map(([label, value]) => (
            <div key={label} style={{ background: "var(--field-raised)", padding: "1rem 1.1rem" }}>
              <div className="eyebrow">{label}</div>
              <div className="amount" style={{ fontSize: "1.45rem", fontWeight: 600, marginTop: "0.2rem" }}>
                {value}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.25rem", gap: "1rem" }}>
          <h2 className="display" style={{ fontSize: "1.9rem" }}>
            Latest on the docket
          </h2>
          <Link href="/docket" className="link-underline" style={{ fontSize: "0.9rem", color: "var(--ink-soft)" }}>
            See all
          </Link>
        </div>
        {!recent ? (
          <Loading />
        ) : recent.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>
            Nothing filed yet. <Link href="/new" className="link-underline">Open the first dispute.</Link>
          </p>
        ) : (
          <div style={{ display: "grid", gap: "1.1rem", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {recent.map((dispute) => (
              <DisputeCard key={dispute.id} dispute={dispute} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
