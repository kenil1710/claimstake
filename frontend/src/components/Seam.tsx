"use client";

import type { DisputeSummary, Verdict } from "@/types";
import { formatGen } from "@/lib/format";

/**
 * The one device the whole interface is built on.
 *
 * A dispute is two people with EQUAL money on opposite readings of a claim, so
 * it is drawn as a divided field: challenger (FALSE) left, defender (TRUE)
 * right, seam between. The split encodes the outcome and nothing else:
 *
 *   OPEN / ACTIVE  50%  — the contract forces the stakes to match exactly, so
 *                         while a dispute is live the seam is honestly centred.
 *   FALSE          88%  — the challenger took the pot; their side floods.
 *   TRUE           12%  — the defender took it.
 *   INCONCLUSIVE   50%  — both refunded. Dead centre is not a placeholder here,
 *                         it is the literal result: neither side moved.
 *   EXPIRED/CANCELED    — no verdict was ever reached, so the field goes flat
 *                         and the seam turns dashed rather than picking a side.
 *
 * The point is that a docket of thirty disputes is readable as geometry before
 * a single word is read.
 */

const WIN_SPLIT = 88;
const LOSE_SPLIT = 12;

export function splitFor(status: string, verdict: Verdict): number {
  if (status !== "RESOLVED") return 50;
  if (verdict === "FALSE") return WIN_SPLIT;
  if (verdict === "TRUE") return LOSE_SPLIT;
  return 50;
}

export function seamTone(status: string, verdict: Verdict): string {
  if (status === "EXPIRED" || status === "CANCELED") return "seam-dead";
  if (status === "RESOLVED" && verdict === "INCONCLUSIVE") return "seam-void";
  return "";
}

/** One-line summary of who holds what, for screen readers and the tooltip. */
function describe(dispute: DisputeSummary): string {
  const stake = formatGen(dispute.challenger_stake);
  if (dispute.status === "OPEN") return `Open. Challenger staked ${stake} GEN; no defender yet.`;
  if (dispute.status === "ACTIVE") return `Active. Both sides staked ${stake} GEN.`;
  if (dispute.status === "RESOLVED") {
    if (dispute.verdict === "TRUE") return "Resolved TRUE. The defender took the pot.";
    if (dispute.verdict === "FALSE") return "Resolved FALSE. The challenger took the pot.";
    return "Resolved inconclusive. Both stakes were refunded in full.";
  }
  if (dispute.status === "EXPIRED") return "Expired with no defender. The stake was refunded.";
  return "Canceled by the challenger. The stake was refunded.";
}

export function Seam({
  dispute,
  settle = false,
  height = "auto",
}: {
  dispute: DisputeSummary;
  /** Play the load-in animation. Reserved for the one hero instance. */
  settle?: boolean;
  height?: string;
}) {
  const split = splitFor(dispute.status, dispute.verdict);
  const tone = seamTone(dispute.status, dispute.verdict);
  const live = dispute.status === "OPEN" || dispute.status === "ACTIVE";
  const stake = formatGen(dispute.challenger_stake);
  const defenderStake = dispute.defender_stake === "0" ? null : formatGen(dispute.defender_stake);

  return (
    <div
      className={`seam ${tone} ${settle ? "seam-settle" : ""}`}
      style={{ ["--split" as string]: `${split}%`, height }}
      role="img"
      aria-label={describe(dispute)}
      title={describe(dispute)}
    >
      <div className="seam-side seam-challenger">
        <div className="eyebrow" style={{ color: "inherit", opacity: 0.75 }}>
          Challenger · false
        </div>
        <div className="amount" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
          {stake} <span style={{ fontSize: "0.7em", opacity: 0.7 }}>GEN</span>
        </div>
      </div>
      <div className="seam-side seam-defender">
        <div className="eyebrow" style={{ color: "inherit", opacity: 0.75 }}>
          Defender · true
        </div>
        <div className="amount" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
          {defenderStake ? (
            <>
              {defenderStake} <span style={{ fontSize: "0.7em", opacity: 0.7 }}>GEN</span>
            </>
          ) : (
            <span style={{ opacity: 0.55, fontSize: "0.8rem", fontWeight: 400 }}>
              {live ? "seat open" : "never taken"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
