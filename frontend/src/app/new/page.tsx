"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { getStats, submitCreateDispute } from "@/lib/contract";
import { useWallet } from "@/components/WalletProvider";
import { useContractWrite } from "@/hooks/useContractWrite";
import { WriteStatus } from "@/components/WriteStatus";
import { PageHeader } from "@/components/ui";
import { formatGen, parseGen } from "@/lib/format";

const MIN_CLAIM_CHARS = 12;
const MAX_CLAIM_CHARS = 300;

/** Matches the contract's own window, in the units it takes. */
const WINDOWS = [
  { minutes: 5, label: "5 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 60 * 24, label: "1 day" },
  { minutes: 60 * 48, label: "2 days" },
  { minutes: 60 * 168, label: "1 week" },
];

/**
 * Filing a claim.
 *
 * Everything checkable is checked here before the wallet opens. Not because a
 * bad submission would lose money — the contract refunds anything it turns down
 * — but because a round trip to the chain and back is a slow way to be told a
 * URL is missing its scheme.
 */
export default function NewClaimPage() {
  const router = useRouter();
  const { account, balance } = useWallet();
  const write = useContractWrite();
  const { data: stats } = useSWR("stats", getStats);

  const [claim, setClaim] = useState("");
  const [url, setUrl] = useState("");
  const [evidence, setEvidence] = useState("");
  const [stake, setStake] = useState("0.1");
  const [minutes, setMinutes] = useState(60 * 24);

  const stakeWei = parseGen(stake);
  const minStake = stats ? BigInt(stats.min_stake) : null;
  const maxStake = stats ? BigInt(stats.max_stake) : null;

  const problems = useMemo(() => {
    const found: string[] = [];
    const trimmed = claim.trim().replace(/\s+/g, " ");
    if (trimmed && trimmed.length < MIN_CLAIM_CHARS) found.push("The claim needs at least 12 characters.");
    if (trimmed.length > MAX_CLAIM_CHARS) found.push("The claim is over 300 characters.");
    if (url.trim() && !/^https?:\/\//i.test(url.trim())) found.push("The URL must start with http:// or https://.");
    if (url.includes(" ")) found.push("The URL cannot contain spaces.");
    if (stake && stakeWei === null) found.push("The stake is not a number.");
    if (stakeWei !== null && minStake !== null && stakeWei < minStake) {
      found.push(`The stake is below the minimum of ${formatGen(minStake)} GEN.`);
    }
    if (stakeWei !== null && maxStake !== null && stakeWei > maxStake) {
      found.push(`The stake is above the maximum of ${formatGen(maxStake)} GEN.`);
    }
    if (stakeWei !== null && balance !== null && stakeWei > balance) {
      found.push(`Your wallet holds ${formatGen(balance)} GEN.`);
    }
    const links = evidence.split(/[\n,|]/).map((s) => s.trim()).filter(Boolean);
    if (links.length > 5) found.push("At most 5 supporting links.");
    if (links.some((link) => !/^https?:\/\//i.test(link))) {
      found.push("Every supporting link must start with http:// or https://.");
    }
    return found;
  }, [claim, url, evidence, stake, stakeWei, minStake, maxStake, balance]);

  const complete = claim.trim().length >= MIN_CLAIM_CHARS && url.trim().length > 0 && stakeWei !== null;
  const ready = complete && problems.length === 0 && Boolean(account) && !write.busy;

  return (
    <>
      <PageHeader
        eyebrow="Open a dispute"
        title="File a claim"
        lede="Quote something a live page asserts, and put money behind it being wrong. Someone else can match your stake to defend it."
      />

      <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "minmax(0, 1.55fr) minmax(260px, 1fr)", alignItems: "start" }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || stakeWei === null) return;
            void write.run(
              (from) => submitCreateDispute(from, claim.trim(), url.trim(), evidence, minutes, stakeWei),
              {
                successMessage: "Filed. Your claim is on the docket waiting for a defender.",
                onAccepted: async () => {
                  router.push("/docket/open");
                },
              },
            );
          }}
          style={{ display: "grid", gap: "1.4rem" }}
        >
          <div>
            <label className="eyebrow" htmlFor="url" style={{ display: "block", marginBottom: "0.35rem" }}>
              Where it was published
            </label>
            <input
              id="url"
              className="field mono"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.org/the-page"
              style={{ fontSize: "0.85rem" }}
            />
            <p style={{ fontSize: "0.82rem", color: "var(--ink-soft)", marginTop: "0.35rem" }}>
              The contract fetches this page and pins a hash of it, so an edit after filing is visible on
              the record. It has to be reachable or the claim is turned down and your stake comes back.
            </p>
          </div>

          <div>
            <label className="eyebrow" htmlFor="claim" style={{ display: "block", marginBottom: "0.35rem" }}>
              The claim you say is wrong
            </label>
            <textarea
              id="claim"
              className="field"
              value={claim}
              onChange={(event) => setClaim(event.target.value)}
              placeholder="Quote the assertion as the page makes it, in one sentence."
              style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem" }}
            />
            <p style={{ fontSize: "0.8rem", color: "var(--ink-faint)", marginTop: "0.3rem" }} className="mono">
              {claim.trim().length}/{MAX_CLAIM_CHARS}
            </p>
          </div>

          <div>
            <label className="eyebrow" htmlFor="ev" style={{ display: "block", marginBottom: "0.35rem" }}>
              Sources that back you (optional, up to 5)
            </label>
            <textarea
              id="ev"
              className="field mono"
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              placeholder={"https://source.example/one\nhttps://source.example/two"}
              style={{ fontSize: "0.82rem", minHeight: "4.5rem" }}
            />
          </div>

          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div>
              <label className="eyebrow" htmlFor="stake" style={{ display: "block", marginBottom: "0.35rem" }}>
                Your stake (GEN)
              </label>
              <input
                id="stake"
                className="field amount"
                value={stake}
                onChange={(event) => setStake(event.target.value)}
                inputMode="decimal"
              />
              {stats ? (
                <p style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: "0.3rem" }} className="mono">
                  {formatGen(stats.min_stake)} – {formatGen(stats.max_stake)} GEN
                </p>
              ) : null}
            </div>
            <div>
              <label className="eyebrow" htmlFor="window" style={{ display: "block", marginBottom: "0.35rem" }}>
                How long the seat stays open
              </label>
              <select
                id="window"
                className="field"
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              >
                {WINDOWS.map((option) => (
                  <option key={option.minutes} value={option.minutes}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: "0.3rem" }}>
                No defender by then and you get everything back.
              </p>
            </div>
          </div>

          {problems.length > 0 ? (
            <ul
              style={{
                listStyle: "none",
                display: "grid",
                gap: "0.3rem",
                border: "1.5px solid var(--gold)",
                background: "color-mix(in srgb, var(--gold) 9%, var(--field-raised))",
                padding: "0.8rem 1rem",
                fontSize: "0.88rem",
              }}
            >
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}

          {write.state.phase !== "idle" ? <WriteStatus state={write.state} /> : null}

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-challenger" disabled={!ready}>
              {write.busy ? "Filing…" : stakeWei !== null ? `Stake ${formatGen(stakeWei)} GEN against it` : "Stake against it"}
            </button>
            {!account ? (
              <span style={{ fontSize: "0.88rem", color: "var(--ink-soft)" }}>Connect a wallet to file.</span>
            ) : null}
          </div>
        </form>

        <aside className="sheet" style={{ padding: "1.15rem", position: "sticky", top: "1.25rem" }}>
          <h2 className="eyebrow" style={{ marginBottom: "0.75rem" }}>
            Before you stake
          </h2>
          <ul style={{ listStyle: "none", display: "grid", gap: "0.85rem", fontSize: "0.89rem", color: "var(--ink-soft)" }}>
            <li>
              <strong style={{ color: "var(--ink)" }}>Judgement calls do not pay.</strong> Opinion,
              prediction and taste settle inconclusive — both sides refunded, no fee. Stake on things a
              source can settle.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Quote it as written.</strong> Validators judge the
              claim you typed against the page, not the argument you wish you had made.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>A dead link is not a false claim.</strong> If the
              page cannot be reached, the filing is turned down and refunded.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Turned down is not lost.</strong> If the contract
              rejects a filing for any reason, the stake is sent straight back in the same transaction.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>One at a time.</strong> There is a three minute wait
              between filings from the same wallet.
            </li>
          </ul>
          {stats ? (
            <p className="mono" style={{ fontSize: "0.75rem", color: "var(--ink-faint)", marginTop: "1rem", borderTop: "1px solid var(--rule)", paddingTop: "0.75rem" }}>
              winner pays {(stats.protocol_fee_bps / 100).toFixed(2)}% to the protocol
            </p>
          ) : null}
        </aside>
      </div>
    </>
  );
}
