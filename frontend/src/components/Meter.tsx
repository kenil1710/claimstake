"use client";

import type { DisputeSummary, Verdict } from "@/types";
import { formatGen } from "@/lib/format";
import { ZERO_ADDRESS } from "@/types";

/**
 * The matchup meter — the one device the whole interface is built on.
 *
 * Where the seam sits IS the outcome:
 *
 *   live (OPEN/ACTIVE) → dead centre, because the contract forces the two
 *                        stakes to match exactly. Balance is the truth here.
 *   challenger won     → floods left. The claim was FALSE.
 *   defender won       → floods right. The claim held up.
 *   inconclusive       → centre, both sides drained to grey. Nobody won, and
 *                        perfect balance is what that means.
 *   expired/withdrawn  → centre, inert. Never reached a verdict at all.
 *
 * Labels sit OUTSIDE the bar, deliberately. Rendering them inside meant that
 * the moment a verdict shifted the seam, the losing side's caption was squeezed
 * into a sliver and broke one word per line before clipping at the card edge —
 * on every resolved dispute, which is most of them. Outside, the bar stays pure
 * geometry and the captions keep a full column no matter where the seam lands.
 */

/** Where the seam sits, as a percentage from the left. */
export function splitFor(status: string, verdict: Verdict): number {
  if (status === "RESOLVED") {
    if (verdict === "FALSE") return 87;
    if (verdict === "TRUE") return 13;
    return 50; // INCONCLUSIVE
  }
  return 50;
}

function modifier(status: string, verdict: Verdict): string {
  if (status === "EXPIRED" || status === "CANCELED") return "meter--dead";
  if (status !== "RESOLVED") return "";
  if (verdict === "FALSE") return "meter--challenger-won";
  if (verdict === "TRUE") return "meter--defender-won";
  return "meter--void";
}

export function Meter({
  dispute,
  height = "3rem",
  animate = true,
}: {
  dispute: DisputeSummary;
  height?: string;
  animate?: boolean;
}) {
  const split = splitFor(dispute.status, dispute.verdict);
  return (
    <div
      className={`meter ${modifier(dispute.status, dispute.verdict)}`}
      style={{
        // The split is the only thing that moves; everything else is derived.
        ["--split" as string]: `${split}%`,
        height,
        transition: animate ? undefined : "none",
      }}
      aria-hidden="true"
    >
      <div className="meter__edge" />
      <div className="meter__fill" />
    </div>
  );
}

/**
 * The meter plus its two captions. This is what cards and detail pages use;
 * the bare `Meter` is for decorative contexts that supply their own labels.
 */
export function Matchup({
  dispute,
  height = "3rem",
  showAmounts = true,
}: {
  dispute: DisputeSummary;
  height?: string;
  showAmounts?: boolean;
}) {
  const seatOpen = dispute.defender === ZERO_ADDRESS;
  const resolved = dispute.status === "RESOLVED";
  const challengerWon = resolved && dispute.verdict === "FALSE";
  const defenderWon = resolved && dispute.verdict === "TRUE";

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1rem",
          marginBottom: "0.5rem",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            className="eyebrow"
            style={{ color: challengerWon ? "var(--challenger)" : "var(--text-faint)" }}
          >
            Challenger · false
          </div>
          {showAmounts ? (
            <div
              className="amount"
              style={{
                fontSize: "1.0625rem",
                color: defenderWon ? "var(--text-faint)" : "var(--challenger)",
                marginTop: "0.15rem",
              }}
            >
              {formatGen(dispute.challenger_stake)}{" "}
              <span style={{ fontSize: "0.7rem", opacity: 0.65, fontWeight: 600 }}>GEN</span>
            </div>
          ) : null}
        </div>

        <div style={{ minWidth: 0, textAlign: "right" }}>
          <div
            className="eyebrow"
            style={{ color: defenderWon ? "var(--defender)" : "var(--text-faint)" }}
          >
            Defender · true
          </div>
          {showAmounts ? (
            <div
              className="amount"
              style={{
                fontSize: "1.0625rem",
                color: seatOpen
                  ? "var(--text-faint)"
                  : challengerWon
                    ? "var(--text-faint)"
                    : "var(--defender)",
                marginTop: "0.15rem",
              }}
            >
              {seatOpen ? (
                <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>seat open</span>
              ) : (
                <>
                  {formatGen(dispute.defender_stake)}{" "}
                  <span style={{ fontSize: "0.7rem", opacity: 0.65, fontWeight: 600 }}>GEN</span>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <Meter dispute={dispute} height={height} />
    </div>
  );
}
