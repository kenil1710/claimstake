"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { getDispute, getStats, submitDefendDispute } from "@/lib/contract";
import { useWallet } from "@/components/WalletProvider";
import { useContractWrite } from "@/hooks/useContractWrite";
import { WriteStatus } from "@/components/WriteStatus";
import { AddressTag, ErrorNote, Loading } from "@/components/ui";
import { Matchup } from "@/components/Meter";
import { formatBps, formatEpoch, formatGen, formatRelative, hostOf, sameAddress } from "@/lib/format";
import { useNow } from "@/hooks/useNow";

/**
 * Taking the other side of one specific claim.
 *
 * Separate from the dispute record because the two pages answer different
 * questions. This one asks "do you want this seat", so it leads with the
 * challenger's case and the exact figure required, and every reason the seat
 * might not be takeable is resolved before the form is shown rather than
 * after the wallet opens.
 *
 * The stake is not an input. The contract requires an EXACT match of the
 * challenger's stake, so offering a field would be offering a choice that
 * does not exist.
 */
export default function DefendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const disputeId = Number(id);
  const router = useRouter();
  const { account } = useWallet();
  const write = useContractWrite();
  const [evidence, setEvidence] = useState("");
  const now = useNow(1_000);

  const { data, error, isLoading, mutate } = useSWR(
    Number.isFinite(disputeId) ? ["dispute", disputeId] : null,
    () => getDispute(disputeId),
    { refreshInterval: 12_000 },
  );
  const { data: stats } = useSWR("stats", getStats);

  if (!Number.isFinite(disputeId)) return <ErrorNote message={`"${id}" is not a dispute number.`} />;
  if (error) return <ErrorNote message={`Could not read dispute #${disputeId}.`} />;
  if (isLoading) return <Loading label={`Reading dispute #${disputeId}`} />;
  if (!data) return <ErrorNote message={`Nothing has been filed under #${disputeId}.`} />;

  const stakeWei = BigInt(data.challenger_stake);
  const windowClosed = now > 0 && data.join_deadline * 1000 <= now;
  const isChallenger = sameAddress(account, data.challenger);
  const paused = stats?.paused ?? false;

  const blocker =
    data.status !== "OPEN"
      ? "This seat has already been taken or the case has closed."
      : windowClosed
        ? "The window on this claim has closed. Nobody can take the seat now."
        : isChallenger
          ? "You filed this claim, so you cannot defend it."
          : paused
            ? "The protocol is paused, so no new stakes can be taken."
            : null;

  const feeBps = stats?.protocol_fee_bps ?? 0;
  const pot = stakeWei * 2n;
  const fee = (pot / 10000n) * BigInt(feeBps);
  const payout = pot - fee;

  return (
    <>
      <Link href="/docket/open" className="link" style={{ fontSize: "0.85rem" }}>
        ← open seats
      </Link>

      <header style={{ margin: "1.25rem 0 2rem" }}>
        <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>
          Dispute #{String(data.id).padStart(3, "0")} · {hostOf(data.claim_url)}
        </div>
        <h1 className="display-black" style={{ fontSize: "clamp(1.7rem, 4.4vw, 2.7rem)", maxWidth: "22ch" }}>
          {data.claim_text}
        </h1>
        <p style={{ marginTop: "0.9rem", fontSize: "0.88rem", color: "var(--text-dim)" }}>
          Filed {formatEpoch(data.created_epoch)} ·{" "}
          <a
            href={data.claim_url}
            target="_blank"
            rel="noreferrer noopener"
            className="link-u num"
            style={{ color: "var(--text-dim)" }}
          >
            read the source
          </a>
        </p>
      </header>

      <div className="card" style={{ padding: "1.35rem", marginBottom: "2rem" }}>
        <Matchup dispute={data} height="3rem" />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            marginTop: "0.9rem",
            paddingTop: "0.9rem",
            borderTop: "1px solid var(--line)",
            flexWrap: "wrap",
          }}
        >
          <AddressTag address={data.challenger} label="challenger" />
          <span className="num" style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            {windowClosed ? "window closed" : `closes ${formatRelative(data.join_deadline, now || undefined)}`}
          </span>
        </div>
      </div>

      <div className="row-2" style={{ alignItems: "start", gap: "2.5rem" }}>
        <div>
          {/* ── The challenger's case ──────────────────────────────────── */}
          <section style={{ marginBottom: "2.25rem" }}>
            <h2 className="display" style={{ fontSize: "1.25rem", marginBottom: "0.85rem" }}>
              What you would be arguing against
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: "0.94rem", marginBottom: "1.1rem", lineHeight: 1.65 }}>
              The challenger says this claim is <strong style={{ color: "var(--challenger)" }}>false</strong>.
              Taking the seat means betting it holds up. Validators read the page and both sides&rsquo;
              evidence before deciding.
            </p>

            <div className="eyebrow" style={{ marginBottom: "0.55rem" }}>
              Their supporting links
            </div>
            {data.challenger_evidence.length ? (
              <ul style={{ listStyle: "none", display: "grid", gap: "0.45rem" }}>
                {data.challenger_evidence.map((link) => (
                  <li key={link}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="link-u num"
                      style={{ fontSize: "0.8rem", color: "var(--text-dim)", wordBreak: "break-all" }}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "var(--text-faint)", fontSize: "0.88rem" }}>
                They filed no supporting links.
              </p>
            )}
          </section>

          {/* ── Take the seat ──────────────────────────────────────────── */}
          {blocker ? (
            <div className="card" style={{ padding: "1.35rem" }}>
              <h2 className="display" style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>
                This seat is not available
              </h2>
              <p style={{ color: "var(--text-dim)", fontSize: "0.92rem", marginBottom: "1.1rem" }}>{blocker}</p>
              <Link href={`/dispute/${data.id}`} className="btn btn-ghost btn-sm">
                See the full record
              </Link>
            </div>
          ) : (
            <div className="card" style={{ padding: "1.35rem" }}>
              <h2 className="display" style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
                Defend this claim
              </h2>

              <label className="eyebrow" htmlFor="evidence" style={{ display: "block", marginBottom: "0.4rem" }}>
                Sources that back you (optional, up to 5)
              </label>
              <textarea
                id="evidence"
                className="field num"
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
                placeholder={"https://source-that-backs-you.example/page\nhttps://another.example/page"}
                style={{ fontSize: "0.82rem", marginBottom: "1rem" }}
              />

              {write.state.phase !== "idle" ? (
                <div style={{ marginBottom: "1rem" }}>
                  <WriteStatus state={write.state} />
                </div>
              ) : null}

              <button
                className="btn btn-defender"
                disabled={!account || write.busy}
                onClick={() =>
                  void write.run((from) => submitDefendDispute(from, data.id, evidence, stakeWei), {
                    successMessage: `You are defending #${data.id}. Either side can now send it to the validators.`,
                    onAccepted: async () => {
                      await mutate();
                      router.push(`/dispute/${data.id}`);
                    },
                  })
                }
              >
                {write.busy ? "Working…" : `Stake ${formatGen(stakeWei)} GEN to defend`}
              </button>

              {!account ? (
                <p style={{ marginTop: "0.7rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
                  Connect a wallet to take this seat.
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Terms ────────────────────────────────────────────────────── */}
        <aside style={{ display: "grid", gap: "1.25rem", position: "sticky", top: "5rem" }}>
          <div className="card" style={{ padding: "1.1rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.75rem" }}>
              Your stake
            </div>
            <div className="amount" style={{ fontSize: "2rem", color: "var(--defender)" }}>
              {formatGen(stakeWei)} <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>GEN</span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-faint)", marginTop: "0.5rem", lineHeight: 1.6 }}>
              Fixed by the contract. It has to match the challenger exactly — equal money is what
              makes the verdict mean something.
            </p>
          </div>

          <div className="card" style={{ padding: "1.1rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>
              If you win
            </div>
            <dl style={{ display: "grid", gap: "0.6rem", fontSize: "0.86rem" }}>
              <Row label="Pot" value={`${formatGen(pot)} GEN`} />
              <Row label={`Protocol fee (${formatBps(feeBps)})`} value={`−${formatGen(fee)} GEN`} />
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: "0.6rem" }}>
                <Row label="You receive" value={`${formatGen(payout)} GEN`} strong />
              </div>
            </dl>
            <p style={{ fontSize: "0.78rem", color: "var(--text-faint)", marginTop: "0.9rem", lineHeight: 1.6 }}>
              Inconclusive takes no fee — both sides get their exact stake back.
            </p>
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
