"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { getStats, submitCreateDispute } from "@/lib/contract";
import { useWallet } from "@/components/WalletProvider";
import { useContractWrite } from "@/hooks/useContractWrite";
import { WriteStatus } from "@/components/WriteStatus";
import { PageHeader } from "@/components/ui";
import { Meter } from "@/components/Meter";
import { formatBps, formatGen, hostOf, parseGen } from "@/lib/format";

const MIN_CLAIM_CHARS = 12;
const MAX_CLAIM_CHARS = 300;

/** The contract takes minutes, so these are minutes — not a converted hour value. */
const WINDOWS = [
  { minutes: 5, label: "5 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 60 * 24, label: "1 day" },
  { minutes: 60 * 48, label: "2 days" },
  { minutes: 60 * 168, label: "1 week" },
];

/**
 * Filing a challenge.
 *
 * Everything checkable is checked here before the wallet opens. Not because a
 * bad submission would lose money — the contract refunds anything it turns
 * down, in the same transaction — but because a round trip to the chain and
 * back is a slow way to be told a URL is missing its scheme.
 */
export default function ChallengePage() {
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

  // The winner's take, shown before anyone commits. Mirrors the contract's own
  // split: fee comes off the pot, the remainder goes to the winner.
  const feeBps = stats?.protocol_fee_bps ?? 0;
  const pot = stakeWei !== null ? stakeWei * 2n : null;
  const fee = pot !== null ? (pot / 10000n) * BigInt(feeBps) : null;
  const payout = pot !== null && fee !== null ? pot - fee : null;

  return (
    <>
      <PageHeader
        eyebrow="Open a dispute"
        title="File a challenge"
        lede="Quote something a live page asserts and put money behind it being wrong. Anyone can match your stake to defend it."
      />

      <div className="row-2" style={{ alignItems: "start", gap: "2.5rem" }}>
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
          style={{ display: "grid", gap: "1.5rem" }}
        >
          <div>
            <label className="eyebrow" htmlFor="url" style={{ display: "block", marginBottom: "0.4rem" }}>
              Where it was published
            </label>
            <input
              id="url"
              className="field num"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.org/the-page"
              style={{ fontSize: "0.875rem" }}
            />
            <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginTop: "0.4rem", lineHeight: 1.6 }}>
              The contract fetches this page and pins a hash of it, so an edit after filing shows on
              the record. It has to be reachable, or the claim is turned down and your stake comes back.
            </p>
          </div>

          <div>
            <label className="eyebrow" htmlFor="claim" style={{ display: "block", marginBottom: "0.4rem" }}>
              The claim you say is wrong
            </label>
            <textarea
              id="claim"
              className="field"
              value={claim}
              onChange={(event) => setClaim(event.target.value)}
              placeholder="Quote the assertion as the page makes it, in one sentence."
              style={{ fontSize: "1rem" }}
            />
            <p className="num" style={{ fontSize: "0.78rem", color: "var(--text-faint)", marginTop: "0.35rem" }}>
              {claim.trim().length}/{MAX_CLAIM_CHARS}
            </p>
          </div>

          <div>
            <label className="eyebrow" htmlFor="ev" style={{ display: "block", marginBottom: "0.4rem" }}>
              Sources that back you (optional, up to 5)
            </label>
            <textarea
              id="ev"
              className="field num"
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              placeholder={"https://source.example/one\nhttps://source.example/two"}
              style={{ fontSize: "0.82rem", minHeight: "4.5rem" }}
            />
          </div>

          <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <div>
              <label className="eyebrow" htmlFor="stake" style={{ display: "block", marginBottom: "0.4rem" }}>
                Your stake (GEN)
              </label>
              <input
                id="stake"
                className="field amount"
                value={stake}
                onChange={(event) => setStake(event.target.value)}
                inputMode="decimal"
                style={{ fontSize: "1.05rem" }}
              />
              {stats ? (
                <p className="num" style={{ fontSize: "0.76rem", color: "var(--text-faint)", marginTop: "0.35rem" }}>
                  {formatGen(stats.min_stake)} – {formatGen(stats.max_stake)} GEN
                </p>
              ) : null}
            </div>
            <div>
              <label className="eyebrow" htmlFor="window" style={{ display: "block", marginBottom: "0.4rem" }}>
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
              <p style={{ fontSize: "0.76rem", color: "var(--text-faint)", marginTop: "0.35rem" }}>
                No defender by then and you get everything back.
              </p>
            </div>
          </div>

          {problems.length > 0 ? (
            <ul
              className="card"
              style={{
                listStyle: "none",
                display: "grid",
                gap: "0.4rem",
                borderColor: "var(--challenger-dim)",
                background: "var(--challenger-wash)",
                padding: "0.9rem 1.1rem",
                fontSize: "0.88rem",
              }}
            >
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}

          {write.state.phase !== "idle" ? <WriteStatus state={write.state} /> : null}

          <div style={{ display: "flex", gap: "0.85rem", alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-challenger" disabled={!ready}>
              {write.busy
                ? "Filing…"
                : stakeWei !== null
                  ? `Stake ${formatGen(stakeWei)} GEN against it`
                  : "Stake against it"}
            </button>
            {!account ? (
              <span style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>
                Connect a wallet to file.
              </span>
            ) : null}
          </div>
        </form>

        {/* ── Preview + terms ──────────────────────────────────────────── */}
        <aside style={{ display: "grid", gap: "1.25rem", position: "sticky", top: "5rem" }}>
          <div className="card" style={{ padding: "1.1rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>
              How it will look
            </div>

            <p
              className="display"
              style={{
                fontSize: "1.05rem",
                lineHeight: 1.32,
                marginBottom: "1rem",
                minHeight: "2.6em",
                color: claim.trim() ? "var(--text)" : "var(--text-faint)",
              }}
            >
              {claim.trim() || "Your claim appears here."}
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: "0.5rem",
              }}
            >
              <div>
                <div className="eyebrow" style={{ color: "var(--challenger)" }}>
                  You · false
                </div>
                <div className="amount" style={{ fontSize: "1rem", color: "var(--challenger)" }}>
                  {stakeWei !== null ? formatGen(stakeWei) : "—"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="eyebrow">Defender · true</div>
                <div className="amount" style={{ fontSize: "0.85rem", color: "var(--text-faint)" }}>
                  seat open
                </div>
              </div>
            </div>

            <Meter
              dispute={{
                id: 0,
                challenger: "",
                defender: "",
                claim_text: "",
                claim_url: "",
                claim_domain: "",
                challenger_stake: "0",
                defender_stake: "0",
                pot: "0",
                status: "OPEN",
                verdict: "",
                created_epoch: 0,
                join_deadline: 0,
              }}
              height="2.25rem"
            />

            {url.trim() ? (
              <p style={{ fontSize: "0.72rem", color: "var(--text-faint)", marginTop: "0.7rem" }}>
                source · {hostOf(url.trim())}
              </p>
            ) : null}
          </div>

          {/* Fee disclosure. Shown as real figures for the stake actually typed,
              because a percentage alone does not tell anyone what they take home. */}
          <div className="card" style={{ padding: "1.1rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>
              If you win
            </div>
            <dl style={{ display: "grid", gap: "0.6rem", fontSize: "0.86rem" }}>
              <Row label="Pot (both stakes)" value={pot !== null ? `${formatGen(pot)} GEN` : "—"} />
              <Row
                label={`Protocol fee${stats ? ` (${formatBps(feeBps)})` : ""}`}
                value={fee !== null ? `−${formatGen(fee)} GEN` : "—"}
              />
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: "0.6rem" }}>
                <Row
                  label="You receive"
                  value={payout !== null ? `${formatGen(payout)} GEN` : "—"}
                  strong
                />
              </div>
            </dl>
            <p style={{ fontSize: "0.78rem", color: "var(--text-faint)", marginTop: "0.9rem", lineHeight: 1.6 }}>
              An inconclusive verdict takes no fee — both sides get their exact stake back.
            </p>
          </div>

          <div className="card" style={{ padding: "1.1rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>
              Before you stake
            </div>
            <ul style={{ listStyle: "none", display: "grid", gap: "0.8rem", fontSize: "0.86rem", color: "var(--text-dim)", lineHeight: 1.58 }}>
              <li>
                <strong style={{ color: "var(--text)" }}>Judgement calls do not pay.</strong> Opinion,
                prediction and taste settle inconclusive. Stake on things a source can settle.
              </li>
              <li>
                <strong style={{ color: "var(--text)" }}>Quote it as written.</strong> Validators judge
                the claim you typed against the page, not the argument you wish you had made.
              </li>
              <li>
                <strong style={{ color: "var(--text)" }}>A dead link is not a false claim.</strong> If
                the page cannot be reached, the filing is turned down and refunded.
              </li>
              <li>
                <strong style={{ color: "var(--text)" }}>Turned down is not lost.</strong> If the
                contract rejects a filing, your stake comes back in the same transaction.
              </li>
              <li>
                <strong style={{ color: "var(--text)" }}>One at a time.</strong> There is a three
                minute wait between filings from the same wallet.
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <dt style={{ color: "var(--text-dim)" }}>{label}</dt>
      <dd
        className="amount"
        style={{ color: strong ? "var(--defender)" : "var(--text)", fontSize: strong ? "1rem" : "0.86rem" }}
      >
        {value}
      </dd>
    </div>
  );
}
