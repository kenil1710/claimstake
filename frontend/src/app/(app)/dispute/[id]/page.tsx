"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  RESOLVE_TIMEOUT_MS,
  getDispute,
  getStats,
  submitCancel,
  submitExpire,
  submitResolve,
} from "@/lib/contract";
import { useWallet } from "@/components/WalletProvider";
import { useContractWrite } from "@/hooks/useContractWrite";
import { WriteStatus } from "@/components/WriteStatus";
import { Matchup } from "@/components/Meter";
import { AddressTag, ErrorNote, Loading, StatusChip, VerdictChip } from "@/components/ui";
import { Reveal, SideReveal } from "@/components/Motion";
import { formatEpoch, formatGen, formatRelative, hostOf, sameAddress, shortAddress } from "@/lib/format";
import { ZERO_ADDRESS } from "@/types";
import { useNow } from "@/hooks/useNow";

export default function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const disputeId = Number(id);
  const { account } = useWallet();
  const write = useContractWrite();
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
        <h1 className="display-black" style={{ fontSize: "2rem", marginBottom: "0.6rem" }}>
          No dispute #{disputeId}
        </h1>
        <p style={{ color: "var(--text-dim)", marginBottom: "1.5rem" }}>
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
  // hide the defend route on first paint for a case that is still open.
  const windowClosed = now > 0 && data.join_deadline * 1000 <= now;
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
      <Link href="/docket" className="link" style={{ fontSize: "0.85rem" }}>
        ← the docket
      </Link>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <header style={{ margin: "1.25rem 0 2rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
          <span className="num" style={{ fontSize: "0.8rem", color: "var(--text-faint)", fontWeight: 600 }}>
            #{String(data.id).padStart(3, "0")}
          </span>
          <StatusChip status={data.status} />
          <VerdictChip verdict={data.verdict} />
          {data.injection_flagged ? (
            <span className="chip" style={{ color: "var(--challenger)" }}>
              Injection detected
            </span>
          ) : null}
          {data.page_changed ? (
            <span className="chip" style={{ color: "var(--neutral)" }}>
              Page edited after filing
            </span>
          ) : null}
        </div>

        <h1 className="display-black" style={{ fontSize: "clamp(1.75rem, 4.6vw, 2.9rem)", maxWidth: "24ch" }}>
          {data.claim_text}
        </h1>

        <p style={{ marginTop: "0.9rem", fontSize: "0.88rem", color: "var(--text-dim)" }}>
          <a
            href={data.claim_url}
            target="_blank"
            rel="noreferrer noopener"
            className="link-u num"
            style={{ color: "var(--text-dim)" }}
          >
            {hostOf(data.claim_url)}
          </a>
          <span style={{ color: "var(--text-faint)" }}> · filed {formatEpoch(data.created_epoch)}</span>
        </p>
      </header>

      {/* ── The matchup ──────────────────────────────────────────────── */}
      <div className="card" style={{ padding: "1.35rem", marginBottom: "2rem" }}>
        <Matchup dispute={data} height="3.5rem" />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            marginTop: "1rem",
            paddingTop: "0.9rem",
            borderTop: "1px solid var(--line)",
            flexWrap: "wrap",
          }}
        >
          <AddressTag address={data.challenger} label="challenger" />
          {data.defender === ZERO_ADDRESS ? (
            <span className="eyebrow">defender — seat open</span>
          ) : (
            <AddressTag address={data.defender} label="defender" />
          )}
        </div>
      </div>

      {/* ── What you can do ──────────────────────────────────────────── */}
      <section style={{ marginBottom: "2.5rem" }}>
        {write.state.phase !== "idle" ? (
          <div style={{ marginBottom: "1rem" }}>
            <WriteStatus state={write.state} />
          </div>
        ) : null}

        {data.status === "OPEN" ? (
          <div className="card" style={{ padding: "1.35rem" }}>
            {canDefend ? (
              <>
                <h2 className="display" style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>
                  This seat is open
                </h2>
                <p style={{ color: "var(--text-dim)", fontSize: "0.93rem", marginBottom: "1.1rem", maxWidth: "62ch" }}>
                  Match the challenger&rsquo;s{" "}
                  <span className="amount" style={{ color: "var(--text)" }}>
                    {formatGen(data.challenger_stake)} GEN
                  </span>{" "}
                  to argue the claim holds up. Window closes {formatRelative(data.join_deadline, now || undefined)}.
                </p>
                <Link href={`/defend/${data.id}`} className="btn btn-defender">
                  Defend this claim
                </Link>
              </>
            ) : canExpire ? (
              <>
                <h2 className="display" style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>
                  Nobody took the other side
                </h2>
                <p style={{ color: "var(--text-dim)", fontSize: "0.93rem", marginBottom: "1.1rem", maxWidth: "62ch" }}>
                  The window closed {formatRelative(data.join_deadline, now || undefined)}{" "}
                  with no defender. Closing this out returns the challenger&rsquo;s full stake —
                  anyone can do it, and no fee is taken.
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
                <h2 className="display" style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>
                  Waiting for a defender
                </h2>
                <p style={{ color: "var(--text-dim)", fontSize: "0.93rem", marginBottom: "1.1rem", maxWidth: "62ch" }}>
                  Your stake is held until someone matches it or the window closes{" "}
                  {formatRelative(data.join_deadline, now || undefined)}. You can withdraw it now while
                  the seat is still empty.
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
              <p style={{ color: "var(--text-dim)" }}>
                {paused
                  ? "The protocol is paused, so no new stakes can be taken. Existing stakes can still be withdrawn."
                  : "This seat is open, but you filed it — you cannot defend your own claim."}
              </p>
            )}
          </div>
        ) : data.status === "ACTIVE" ? (
          <div className="card" style={{ padding: "1.35rem" }}>
            <h2 className="display" style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>
              Both sides are in
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: "0.93rem", marginBottom: "1.1rem", maxWidth: "62ch" }}>
              <span className="amount" style={{ color: "var(--text)" }}>
                {formatGen(data.pot)} GEN
              </span>{" "}
              is on the table. Sending this to the validators makes them read the page and both
              sides&rsquo; evidence, then agree on a verdict. It takes a minute or so, and anyone can
              start it — not just the two parties.
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
              <p style={{ marginTop: "0.7rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
                Paused — settlement is on hold.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── Verdict ──────────────────────────────────────────────────── */}
      {data.status === "RESOLVED" ? (
        <Reveal>
          <section
            className="card"
            style={{
              padding: "1.6rem",
              marginBottom: "2.5rem",
              borderColor:
                data.verdict === "FALSE"
                  ? "var(--challenger-dim)"
                  : data.verdict === "TRUE"
                    ? "var(--defender-dim)"
                    : "var(--line-bright)",
            }}
          >
            <div style={{ display: "flex", gap: "0.85rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
              <h2 className="display-black" style={{ fontSize: "1.7rem" }}>
                Verdict
              </h2>
              <VerdictChip verdict={data.verdict} />
              <span className="num" style={{ fontSize: "0.78rem", color: "var(--text-faint)" }}>
                confidence {data.confidence}/100 · settled {formatEpoch(data.resolved_epoch)}
              </span>
            </div>

            <p style={{ fontSize: "1rem", lineHeight: 1.68, maxWidth: "72ch", marginBottom: "1.5rem", color: "var(--text-dim)" }}>
              {data.reasoning || "No reasoning was recorded."}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "1.25rem",
                borderTop: "1px solid var(--line)",
                paddingTop: "1.25rem",
              }}
            >
              <Figure label="Pot" value={`${formatGen(data.pot)} GEN`} />
              <Figure label="Protocol fee" value={`${formatGen(data.fee)} GEN`} />
              <Figure
                label={data.verdict === "INCONCLUSIVE" ? "Refunded" : "Paid to winner"}
                value={`${formatGen(data.verdict === "INCONCLUSIVE" ? data.pot : data.payout)} GEN`}
                tone={
                  data.verdict === "FALSE"
                    ? "var(--challenger)"
                    : data.verdict === "TRUE"
                      ? "var(--defender)"
                      : "var(--text)"
                }
              />
              <Figure
                label="Winner"
                value={data.winner === ZERO_ADDRESS ? "neither side" : shortAddress(data.winner)}
              />
            </div>

            {data.verdict === "INCONCLUSIVE" ? (
              <p style={{ marginTop: "1.1rem", fontSize: "0.89rem", color: "var(--text-dim)" }}>
                No fee was taken. Each side got its own stake back exactly.
              </p>
            ) : null}
            {(isChallenger || isDefender) && data.verdict !== "INCONCLUSIVE" ? (
              <p
                style={{
                  marginTop: "1.1rem",
                  fontSize: "0.89rem",
                  color: sameAddress(account, data.winner) ? "var(--defender)" : "var(--challenger)",
                }}
              >
                {sameAddress(account, data.winner)
                  ? `You won this one. ${formatGen(data.payout)} GEN went to your wallet.`
                  : "You lost this one. Your stake went to the other side."}
              </p>
            ) : null}
          </section>
        </Reveal>
      ) : null}

      {/* ── The two cases, side by side ──────────────────────────────── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
          gap: "1.25rem",
          marginBottom: "2.5rem",
        }}
      >
        <SideReveal side="challenger">
          <EvidencePanel
            side="challenger"
            heading="Challenger says false"
            address={data.challenger}
            urls={data.challenger_evidence}
            empty="Filed no supporting links."
          />
        </SideReveal>
        <SideReveal side="defender">
          <EvidencePanel
            side="defender"
            heading="Defender says true"
            address={data.defender === ZERO_ADDRESS ? null : data.defender}
            urls={data.defender_evidence}
            empty={data.defender === ZERO_ADDRESS ? "Nobody has taken this seat." : "Filed no supporting links."}
          />
        </SideReveal>
      </section>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h3 className="eyebrow" style={{ marginBottom: "1rem" }}>
          Timeline
        </h3>
        <ol style={{ listStyle: "none", display: "grid", gap: "0" }}>
          <Event label="Filed" when={formatEpoch(data.created_epoch)} done />
          <Event
            label={data.defender === ZERO_ADDRESS ? "Seat window closes" : "Seat taken"}
            when={
              data.defender === ZERO_ADDRESS
                ? formatEpoch(data.join_deadline)
                : shortAddress(data.defender)
            }
            done={data.defender !== ZERO_ADDRESS || windowClosed}
          />
          <Event
            label={
              data.status === "RESOLVED"
                ? "Settled"
                : data.status === "EXPIRED"
                  ? "Expired, stake returned"
                  : data.status === "CANCELED"
                    ? "Withdrawn by the challenger"
                    : "Awaiting a verdict"
            }
            when={data.resolved_epoch ? formatEpoch(data.resolved_epoch) : "—"}
            done={data.status === "RESOLVED" || data.status === "EXPIRED" || data.status === "CANCELED"}
            last
          />
        </ol>
      </section>

      {/* ── The page as the contract read it ─────────────────────────── */}
      <section>
        <h3 className="eyebrow" style={{ marginBottom: "0.75rem" }}>
          The page as the contract read it
        </h3>
        <div className="card" style={{ padding: "1.1rem" }}>
          <p className="num" style={{ fontSize: "0.72rem", color: "var(--text-faint)", marginBottom: "0.75rem" }}>
            content hash {data.claim_hash || "—"}
            {data.page_changed ? " · the live page no longer matches this" : ""}
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "var(--font-body)",
              fontSize: "0.78rem",
              lineHeight: 1.6,
              color: "var(--text-dim)",
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

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: "0.35rem" }}>
        {label}
      </div>
      <div className="amount" style={{ fontSize: "1.2rem", color: tone ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function EvidencePanel({
  side,
  heading,
  address,
  urls,
  empty,
}: {
  side: "challenger" | "defender";
  heading: string;
  address: string | null;
  urls: string[];
  empty: string;
}) {
  const hue = side === "challenger" ? "var(--challenger)" : "var(--defender)";
  return (
    <div
      className="card"
      style={{
        padding: "1.35rem",
        height: "100%",
        // A hairline in the party's colour on the party's own side — left for
        // the challenger, right for the defender, matching the meter above.
        borderInlineStartWidth: side === "challenger" ? "2px" : "1px",
        borderInlineEndWidth: side === "defender" ? "2px" : "1px",
        borderInlineStartColor: side === "challenger" ? hue : "var(--line)",
        borderInlineEndColor: side === "defender" ? hue : "var(--line)",
      }}
    >
      <div className="eyebrow" style={{ color: hue, marginBottom: "0.5rem" }}>
        {heading}
      </div>
      {address ? (
        <div className="num" style={{ fontSize: "0.78rem", color: "var(--text-faint)", marginBottom: "1rem" }}>
          {shortAddress(address)}
        </div>
      ) : (
        <div style={{ marginBottom: "1rem" }} />
      )}
      {urls.length ? (
        <ul style={{ listStyle: "none", display: "grid", gap: "0.45rem" }}>
          {urls.map((url) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="link-u num"
                style={{ fontSize: "0.8rem", color: "var(--text-dim)", wordBreak: "break-all" }}
              >
                {url}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: "var(--text-faint)", fontSize: "0.88rem" }}>{empty}</p>
      )}
    </div>
  );
}

function Event({
  label,
  when,
  done,
  last,
}: {
  label: string;
  when: string;
  done?: boolean;
  last?: boolean;
}) {
  return (
    <li style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch" }}>
        <span
          style={{
            width: "9px",
            height: "9px",
            marginTop: "6px",
            flexShrink: 0,
            background: done ? "var(--text)" : "transparent",
            border: `1px solid ${done ? "var(--text)" : "var(--line-bright)"}`,
          }}
        />
        {!last ? <span style={{ flex: 1, width: "1px", background: "var(--line)", minHeight: "1.6rem" }} /> : null}
      </div>
      <div style={{ paddingBottom: last ? 0 : "1.1rem" }}>
        <div style={{ fontSize: "0.92rem", color: done ? "var(--text)" : "var(--text-faint)" }}>{label}</div>
        <div className="num" style={{ fontSize: "0.78rem", color: "var(--text-faint)" }}>
          {when}
        </div>
      </div>
    </li>
  );
}
