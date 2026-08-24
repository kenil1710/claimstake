/**
 * Shapes returned by ClaimStake's view methods.
 *
 * Every view returns a JSON *string*, so these describe the parsed result.
 *
 * Money is a STRING everywhere, never a number. Stakes are u128 wei — 100 GEN
 * is 1e20, which loses precision as a JS number well before it loses it on
 * chain. Convert with BigInt at the edge and format for display; never let a
 * wei amount become a `number`.
 */

export type DisputeStatus = "OPEN" | "ACTIVE" | "RESOLVED" | "EXPIRED" | "CANCELED";
export type Verdict = "TRUE" | "FALSE" | "INCONCLUSIVE" | "";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** The row shape shared by every list view. */
export interface DisputeSummary {
  id: number;
  challenger: string;
  defender: string;
  claim_text: string;
  claim_url: string;
  claim_domain: string;
  challenger_stake: string;
  defender_stake: string;
  pot: string;
  status: DisputeStatus;
  verdict: Verdict;
  created_epoch: number;
  join_deadline: number;
}

/** Everything `get_dispute` adds on top of the summary. */
export interface Dispute extends DisputeSummary {
  found: true;
  claim_hash: string;
  claim_preview: string;
  challenger_evidence: string[];
  defender_evidence: string[];
  winner: string;
  reasoning: string;
  confidence: number;
  claim_reachable: boolean;
  page_changed: boolean;
  injection_flagged: boolean;
  fee: string;
  payout: string;
  resolved_epoch: number;
}

export interface Stats {
  total: number;
  resolved: number;
  challenger_wins: number;
  defender_wins: number;
  inconclusive: number;
  expired: number;
  canceled: number;
  total_volume: string;
  total_fees: string;
  total_paid: string;
  total_refunded: string;
  protocol_balance: string;
  locked_stakes: string;
  /** Value the contract holds but owes nobody. Should always be "0". */
  unallocated: string;
  balance: string;
  last_out_epoch: number;
  protocol_fee_bps: number;
  min_stake: string;
  max_stake: string;
  resolution_window: number;
  paused: boolean;
  owner: string;
}

export interface UserHistoryRow extends DisputeSummary {
  side: "challenger" | "defender";
  winner: string;
  payout: string;
}

export interface UserHistory {
  address: string;
  wins: number;
  losses: number;
  total: number;
  disputes: UserHistoryRow[];
}

/**
 * What a payable write answers with.
 *
 * create_dispute and defend_dispute do NOT revert when they reject input — a
 * revert would keep the value that rode in with the call. They refund and
 * return this instead, so a transaction that succeeded may still have been
 * turned down. Always read `ok` before assuming the stake was taken.
 */
export type WriteResult =
  | { ok: true; id?: number; status?: string }
  | { ok: false; reason: string; refunded: string };
