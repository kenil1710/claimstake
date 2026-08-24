"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  RESOLVE_TIMEOUT_MS,
  getDispute,
  getStats,
  submitCancel,
  submitDefendDispute,
  submitExpire,
  submitResolve,
} from "@/lib/contract";
import { useWallet } from "@/components/WalletProvider";
import { useContractWrite } from "@/hooks/useContractWrite";
import { WriteStatus } from "@/components/WriteStatus";
import { Seam } from "@/components/Seam";
import { AddressTag, ErrorNote, Loading, StatusChip, VerdictChip } from "@/components/ui";
import { formatEpoch, formatGen, formatRelative, hostOf, sameAddress, shortAddress } from "@/lib/format";
import { ZERO_ADDRESS } from "@/types";
import { useNow } from "@/hooks/useNow";

export default function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const disputeId = Number(id);
  const { account } = useWallet();
  const write = useContractWrite();
  const [evidence, setEvidence] = useState("");
  const now = useNow(5_000);

  const { data, error, isLoading, mutate } = useSWR(
    Number.isFinite(disputeId) ? ["dispute", disputeId] : null,
    () => getDispute(disputeId),
    { refreshInterval: 12_000 },
  );
  const { data: stats } = useSWR("stats", getStats);

  if (!Number.isFinite(disputeId)) return <ErrorNote message={`"${id}" is not a dispute number.`} />;
  if (error) return <ErrorNote message={`Could not read dispute #${disputeId}.`} />;
  if (isLoading) return <Loading label={`Reading dispute #${disputeId}`} />;
  if (!data) {
    return (
      <div style={{ paddingTop: "2rem" }}>
        <h1 className="display" style={{ fontSize: "2rem", marginBottom: "0.6rem" }}>
          No dispute #{disputeId}
        </h1>
        <p style={{ color: "var(--ink-soft)", marginBottom: "1.5rem" }}>
          Nothing has been filed under that number.
        </p>
        <Link href="/docket" className="btn btn-ghost">
          Back to the docket
        </Link>
      </div>
    );
  }

  const isChallenger = sameAddress(account, data.challenger);
  const isDefender = sameAddress(account, data.defender);
  // Before the first tick the deadline is unknown; treating it as passed would
  // hide the defend button on first paint for a case that is still open.
  const windowClosed = now > 0 && data.join_deadline * 1000 <= now;
  const stakeWei = BigInt(data.challenger_stake);
  const paused = stats?.paused ?? false;

  const refresh = async () => {
    await mutate();
  };

  const canDefend = data.status === "OPEN" && !windowClosed && !isChallenger && !paused;
  const canCancel = data.status === "OPEN" && isChallenger;
  const canExpire = data.status === "OPEN" && windowClosed;
  const canResolve = data.status === "ACTIVE" && !paused;

  return (
    <>
      <Link href="/docket" className="link-underline" style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
        ← the docket
      </Link>

      <header style={{ margin: "1.25rem 0 2rem" }}>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.9rem" }}>
          <span className="mono" style={{ fontSize: "0.85rem", color: "var(--ink-faint)" }}>
            #{String(data.id).padStart(3, "0")}
          </span>
          <StatusChip status={data.status} />
          <VerdictChip verdict={data.verdict} />
          {data.injection_flagged ? (
            <span className="chip" style={{ color: "var(--challenger)" }}>
              injection detected
            </span>
          ) : null}
          {data.page_changed ? (
            <span className="chip" style={{ color: "var(--gold)" }}>
              page edited after filing
            </span>
          ) : null}
        </div>

        <h1 className="display" style={{ fontSize: "clamp(1.7rem, 4.2vw, 2.7rem)", lineHeight: 1.16, maxWidth: "24ch" }}>
          {data.claim_text}
        </h1>

        <p style={{ marginTop: "0.85rem", fontSize: "0.9rem" }}>
          <a href={data.claim_url} target="_blank" rel="noreferrer noopener" className="mono link-underline">
            {hostOf(data.claim_url)}
          </a>
          <span style={{ color: "var(--ink-faint)" }}> · filed {formatEpoch(data.created_epoch)}</span>
        </p>
      </header>

      <div className="sheet" style={{ marginBottom: "2rem" }}>
        <Seam dispute={data} height="6rem" />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            padding: "0.7rem 0.9rem",
            borderTop: "1px solid var(--rule)",
            flexWrap: "wrap",
            fontSize: "0.8rem",
          }}
        >
          <AddressTag address={data.challenger} label="challenger" />
          {data.defender === ZERO_ADDRESS ? (
            <span className="mono" style={{ fontSize: "0.8rem", color: "var(--ink-faint)" }}>
              defender — seat open
            </span>
          ) : (
            <AddressTag address={data.defender} label="defender" />
          )}
        </div>
      </div>

      {/* ── What you can do about it ─────────────────────────────────────── */}
      <section style={{ marginBottom: "2.5rem" }}>
        {write.state.phase !== "idle" ? (
          <div style={{ marginBottom: "1rem" }}>
            <WriteStatus state={write.state} />
          </div>
        ) : null}

        {data.status === "OPEN" ? (
          <div className="sheet" style={{ padding: "1.25rem" }}>
            {canDefend ? (
              <>
                <h2 className="display" style={{ fontSize: "1.45rem", marginBottom: "0.35rem" }}>
                  Defend this claim
                </h2>
                <p style={{ color: "var(--ink-soft)", fontSize: "0.94rem", marginBottom: "1rem", maxWidth: "62ch" }}>
                  You are betting the claim is <strong>true</strong>. Stake must match the challenger&rsquo;s
                  exactly: <span className="amount">{formatGen(stakeWei)} GEN</span>. Window closes{" "}
                  {formatRelative(data.join_deadline)}.
                </p>
                <label className="eyebrow" htmlFor="evidence" style={{ display: "block", marginBottom: "0.35rem" }}>
                  Supporting links (optional, up to 5)
                </label>
                <textarea
                  id="evidence"
                  className="field"
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder={"https://source-that-backs-you.example/page\nhttps://another.example/page"}
                  style={{ marginBottom: "0.9rem" }}
                />
                <button
                  className="btn btn-defender"
                  disabled={!account || write.busy}
                  onClick={() =>
                    void write.run((from) => submitDefendDispute(from, data.id, evidence, stakeWei), {
                      onAccepted: refresh,
                      successMessage: `You are defending #${data.id}. Either side can now send it to the validators.`,
                    })
                  }
                >
                  {write.busy ? "Working…" : `Stake ${formatGen(stakeWei)} GEN to defend`}
                </button>
                {!account ? (
                  <p style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                    Connect a wallet to take this seat.
                  </p>
                ) : null}
              </>
            ) : canExpire ? (
              <>
                <h2 className="display" style={{ fontSize: "1.45rem", marginBottom: "0.35rem" }}>
                  Nobody took the other side
                </h2>
                <p style={{ color: "var(--ink-soft)", fontSize: "0.94rem", marginBottom: "1rem", maxWidth: "62ch" }}>
                  The window closed {formatRelative(data.join_deadline)} with no defender. Closing this out
                  returns the challenger&rsquo;s full stake — anyone can do it, and nothing is taken as a fee.
                </p>
                <button
                  className="btn"
                  disabled={!account || write.busy}
                  onClick={() =>
                    void write.run((from) => submitExpire(from, data.id), {
                      onAccepted: refresh,
                      successMessage: `#${data.id} closed out. The stake goes back to the challenger.`,
                    })
                  }
                >
                  {write.busy ? "Working…" : "Close it out and refund"}
                </button>
              </>
            ) : isChallenger ? (
              <>
                <h2 className="display" style={{ fontSize: "1.45rem", marginBottom: "0.35rem" }}>
                  Waiting for a defender
                </h2>
                <p style={{ color: "var(--ink-soft)", fontSize: "0.94rem", marginBottom: "1rem", maxWidth: "62ch" }}>
                  Your stake is held until someone matches it or the window closes {formatRelative(data.join_deadline)}.
                  You can withdraw it now while the seat is still empty.
                </p>
                <button
                  className="btn btn-ghost"
                  disabled={!canCancel || write.busy}
                  onClick={() =>
                    void write.run((from) => submitCancel(from, data.id), {
                      onAccepted: refresh,
                      successMessage: `#${data.id} withdrawn. Your stake is on its way back.`,
                    })
                  }
                >
                  {write.busy ? "Working…" : "Withdraw the claim"}
                </button>
              </>
            ) : (
              <p style={{ color: "var(--ink-soft)" }}>
                {paused
                  ? "The protocol is paused, so no new stakes can be taken. Existing stakes can still be withdrawn."
                  : "This seat is open, but you filed it — you cannot defend your own claim."}
              </p>
            )}
          </div>
        ) : data.status === "ACTIVE" ? (
          <div className="sheet" style={{ padding: "1.25rem" }}>
            <h2 className="display" style={{ fontSize: "1.45rem", marginBottom: "0.35rem" }}>
              Both sides are in
            </h2>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.94rem", marginBottom: "1rem", maxWidth: "62ch" }}>
              {formatGen(data.pot)} GEN is on the table. Sending this to the validators makes them read the
              page and both sides&rsquo; evidence, then agree on a verdict. It takes a minute or so, and
              anyone can start it — not just the two parties.
            </p>
            <button
              className="btn"
              disabled={!account || write.busy || !canResolve}
              onClick={() =>
                void write.run((from) => submitResolve(from, data.id), {
                  timeoutMs: RESOLVE_TIMEOUT_MS,
                  onAccepted: refresh,
                  successMessage: `#${data.id} settled. The pot has moved.`,
                })
              }
            >
              {write.busy ? "Validators are reading…" : "Send it to the validators"}
            </button>
            {paused ? (
              <p style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                Paused — settlement is on hold.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── The verdict ──────────────────────────────────────────────────── */}
      {data.status === "RESOLVED" ? (
        <section className="sheet" style={{ padding: "1.35rem", marginBottom: "2.5rem" }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "baseline", flexWrap: "wrap", marginBottom: "0.9rem" }}>
            <h2 className="display" style={{ fontSize: "1.6rem" }}>
              Verdict
            </h2>
            <VerdictChip verdict={data.verdict} />
            <span className="mono" style={{ fontSize: "0.78rem", color: "var(--ink-faint)" }}>
              confidence {data.confidence}/100 · settled {formatEpoch(data.resolved_epoch)}
            </span>
          </div>

          <p style={{ fontSize: "1.02rem", lineHeight: 1.6, maxWidth: "72ch", marginBottom: "1.25rem" }}>
            {data.reasoning || "No reasoning was recorded."}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", borderTop: "1px solid var(--rule)", paddingTop: "1rem" }}>
            <div>
              <div className="eyebrow">Pot</div>
              <div className="amount" style={{ fontSize: "1.2rem", fontWeight: 600 }}>{formatGen(data.pot)} GEN</div>
            </div>
            <div>
              <div className="eyebrow">Protocol fee</div>
              <div className="amount" style={{ fontSize: "1.2rem", fontWeight: 600 }}>{formatGen(data.fee)} GEN</div>
            </div>
            <div>
              <div className="eyebrow">{data.verdict === "INCONCLUSIVE" ? "Refunded" : "Paid to winner"}</div>
              <div className="amount" style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--gold)" }}>
                {data.verdict === "INCONCLUSIVE" ? formatGen(data.pot) : formatGen(data.payout)} GEN
              </div>
            </div>
            <div>
              <div className="eyebrow">Winner</div>
              <div className="mono" style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: "0.2rem" }}>
                {data.winner === ZERO_ADDRESS ? "neither side" : shortAddress(data.winner)}
              </div>
            </div>
          </div>

          {data.verdict === "INCONCLUSIVE" ? (
            <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "var(--ink-soft)" }}>
              No fee was taken. Each side got its own stake back exactly.
            </p>
          ) : null}
          {(isChallenger || isDefender) && data.verdict !== "INCONCLUSIVE" ? (
            <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: sameAddress(account, data.winner) ? "var(--defender)" : "var(--challenger)" }}>
              {sameAddress(account, data.winner)
                ? `You won this one. ${formatGen(data.payout)} GEN went to your wallet.`
                : "You lost this one. Your stake went to the other side."}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── The record ───────────────────────────────────────────────────── */}
      <section style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div>
          <h3 className="eyebrow" style={{ marginBottom: "0.6rem" }}>
            Challenger&rsquo;s evidence
          </h3>
          <EvidenceList urls={data.challenger_evidence} empty="Filed no supporting links." />
        </div>
        <div>
          <h3 className="eyebrow" style={{ marginBottom: "0.6rem" }}>
            Defender&rsquo;s evidence
          </h3>
          <EvidenceList urls={data.defender_evidence} empty="Filed no supporting links." />
        </div>
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h3 className="eyebrow" style={{ marginBottom: "0.6rem" }}>
          The page as the contract read it
        </h3>
        <div className="hairline" style={{ background: "var(--field-raised)", padding: "1rem" }}>
          <p className="mono" style={{ fontSize: "0.72rem", color: "var(--ink-faint)", marginBottom: "0.6rem" }}>
            content hash {data.claim_hash || "—"}
            {data.page_changed ? " · the live page no longer matches this" : ""}
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
              lineHeight: 1.55,
              color: "var(--ink-soft)",
              maxHeight: "18rem",
              overflowY: "auto",
              margin: 0,
            }}
          >
            {data.claim_preview || "The page could not be read."}
          </pre>
        </div>
      </section>
    </>
  );
}

function EvidenceList({ urls, empty }: { urls: string[]; empty: string }) {
  if (!urls.length) {
    return <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>{empty}</p>;
  }
  return (
    <ul style={{ listStyle: "none", display: "grid", gap: "0.4rem" }}>
      {urls.map((url) => (
        <li key={url}>
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="mono link-underline"
            style={{ fontSize: "0.8rem", wordBreak: "break-all" }}
          >
            {url}
          </a>
        </li>
      ))}
    </ul>
  );
}
