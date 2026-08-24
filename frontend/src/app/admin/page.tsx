"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  getStats,
  submitSetParams,
  submitSetPaused,
  submitSweep,
  submitWithdrawFees,
} from "@/lib/contract";
import { useWallet } from "@/components/WalletProvider";
import { useContractWrite } from "@/hooks/useContractWrite";
import { WriteStatus } from "@/components/WriteStatus";
import { EmptyState, ErrorNote, Loading, PageHeader, Stat } from "@/components/ui";
import { formatBps, formatGen, parseGen, sameAddress, shortAddress } from "@/lib/format";
import { CONTRACT_ADDRESS } from "@/lib/genlayer";

export default function AdminPage() {
  const { account } = useWallet();
  const write = useContractWrite();
  const { data: stats, error, isLoading, mutate } = useSWR("stats-admin", getStats, {
    refreshInterval: 15_000,
  });

  const [feeBps, setFeeBps] = useState("");
  const [minStake, setMinStake] = useState("");
  const [maxStake, setMaxStake] = useState("");
  const [windowHours, setWindowHours] = useState("");
  const [payoutTo, setPayoutTo] = useState("");

  if (error) return <ErrorNote message="Could not read protocol state." />;
  if (isLoading || !stats) return <Loading />;

  const isOwner = sameAddress(account, stats.owner);
  const refresh = async () => {
    await mutate();
  };
  const destination = payoutTo.trim() || account || "";
  const validDestination = /^0x[0-9a-fA-F]{40}$/.test(destination);
  const unallocated = BigInt(stats.unallocated || "0");

  return (
    <>
      <PageHeader
        eyebrow="Protocol controls"
        title="Administration"
        lede="Fee, stake bounds, the pause switch, and the money the contract is holding."
      />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "1px",
          background: "var(--rule)",
          border: "1.5px solid var(--ink)",
          marginBottom: "2.25rem",
        }}
      >
        {[
          { label: "Contract balance", value: `${formatGen(stats.balance)} GEN` },
          { label: "Staked and locked", value: `${formatGen(stats.locked_stakes)} GEN` },
          { label: "Fees to withdraw", value: `${formatGen(stats.protocol_balance)} GEN`, tone: "var(--gold)" },
          { label: "Refunded to date", value: `${formatGen(stats.total_refunded)} GEN` },
          {
            label: "Unallocated",
            value: `${formatGen(stats.unallocated)} GEN`,
            tone: unallocated > 0n ? "var(--challenger)" : "var(--defender)",
          },
        ].map((item) => (
          <div key={item.label} style={{ background: "var(--field-raised)", padding: "1rem 1.1rem" }}>
            <Stat label={item.label} value={item.value} tone={item.tone} />
          </div>
        ))}
      </section>

      <p
        className="mono"
        style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginBottom: "2rem" }}
      >
        contract {shortAddress(CONTRACT_ADDRESS, 10, 8)} · owner {shortAddress(stats.owner, 10, 8)} ·{" "}
        {stats.paused ? "PAUSED" : "live"} · fee {formatBps(stats.protocol_fee_bps)}
      </p>

      {/* Unallocated value is the alarm on this page. It should always be zero:
          rejected stakes are refunded in the same transaction that turns them
          down. Anything above zero arrived by a route that bypassed that. */}
      {unallocated > 0n ? (
        <div
          style={{
            border: "1.5px solid var(--challenger)",
            background: "var(--challenger-wash)",
            padding: "1rem 1.15rem",
            marginBottom: "2rem",
          }}
        >
          <h2 className="eyebrow" style={{ color: "var(--challenger)", marginBottom: "0.4rem" }}>
            Unallocated value
          </h2>
          <p style={{ fontSize: "0.92rem", color: "var(--challenger)", maxWidth: "70ch" }}>
            The contract holds {formatGen(stats.unallocated)} GEN it does not owe to any stake or fee.
            Sweeping returns it. The contract refuses to sweep within an hour of its last payout, so a
            transfer that has not finalised yet is never mistaken for a surplus.
          </p>
        </div>
      ) : null}

      {!account ? (
        <EmptyState title="Connect a wallet" body="Protocol controls need the owner's key." />
      ) : !isOwner ? (
        <EmptyState
          title="Not the owner"
          body={`These controls are restricted to ${shortAddress(stats.owner)}. You are connected as ${shortAddress(account)}.`}
        />
      ) : (
        <>
          {write.state.phase !== "idle" ? (
            <div style={{ marginBottom: "1.5rem" }}>
              <WriteStatus state={write.state} />
            </div>
          ) : null}

          <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))" }}>
            <section className="sheet" style={{ padding: "1.15rem" }}>
              <h2 className="display" style={{ fontSize: "1.35rem", marginBottom: "0.3rem" }}>
                {stats.paused ? "Resume the protocol" : "Pause the protocol"}
              </h2>
              <p style={{ fontSize: "0.88rem", color: "var(--ink-soft)", marginBottom: "1rem" }}>
                Pausing stops new filings and settlement. It never traps money: withdrawing a claim and
                closing out an expired one both keep working while paused.
              </p>
              <button
                className={stats.paused ? "btn btn-defender" : "btn btn-ghost"}
                disabled={write.busy}
                onClick={() =>
                  void write.run((from) => submitSetPaused(from, !stats.paused), {
                    onAccepted: refresh,
                    successMessage: stats.paused ? "Protocol resumed." : "Protocol paused.",
                  })
                }
              >
                {stats.paused ? "Resume" : "Pause"}
              </button>
            </section>

            <section className="sheet" style={{ padding: "1.15rem" }}>
              <h2 className="display" style={{ fontSize: "1.35rem", marginBottom: "0.3rem" }}>
                Withdraw fees
              </h2>
              <p style={{ fontSize: "0.88rem", color: "var(--ink-soft)", marginBottom: "1rem" }}>
                {formatGen(stats.protocol_balance)} GEN has accrued from settled disputes.
              </p>
              <input
                className="field mono"
                value={payoutTo}
                onChange={(event) => setPayoutTo(event.target.value)}
                placeholder={account}
                style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}
                aria-label="Destination address"
              />
              <button
                className="btn"
                disabled={write.busy || BigInt(stats.protocol_balance) === 0n || !validDestination}
                onClick={() =>
                  void write.run((from) => submitWithdrawFees(from, destination), {
                    onAccepted: refresh,
                    successMessage: `Withdrew ${formatGen(stats.protocol_balance)} GEN.`,
                  })
                }
              >
                Withdraw to {shortAddress(destination || account)}
              </button>
            </section>

            <section className="sheet" style={{ padding: "1.15rem" }}>
              <h2 className="display" style={{ fontSize: "1.35rem", marginBottom: "0.3rem" }}>
                Sweep unallocated
              </h2>
              <p style={{ fontSize: "0.88rem", color: "var(--ink-soft)", marginBottom: "1rem" }}>
                Returns value the contract holds but owes nobody. Capped at the surplus, so it can never
                reach a live stake or an unwithdrawn fee.
              </p>
              <button
                className="btn btn-ghost"
                disabled={write.busy || unallocated === 0n || !validDestination}
                onClick={() =>
                  void write.run((from) => submitSweep(from, destination, "0"), {
                    onAccepted: refresh,
                    successMessage: "Swept the unallocated balance.",
                  })
                }
              >
                {unallocated === 0n ? "Nothing to sweep" : `Sweep ${formatGen(stats.unallocated)} GEN`}
              </button>
            </section>

            <section className="sheet" style={{ padding: "1.15rem" }}>
              <h2 className="display" style={{ fontSize: "1.35rem", marginBottom: "0.3rem" }}>
                Parameters
              </h2>
              <p style={{ fontSize: "0.88rem", color: "var(--ink-soft)", marginBottom: "1rem" }}>
                Blank fields keep their current value.
              </p>
              <div style={{ display: "grid", gap: "0.7rem" }}>
                <label className="eyebrow">
                  Fee, basis points (now {stats.protocol_fee_bps}, max 1000)
                  <input className="field amount" value={feeBps} onChange={(e) => setFeeBps(e.target.value)} placeholder={String(stats.protocol_fee_bps)} inputMode="numeric" />
                </label>
                <label className="eyebrow">
                  Minimum stake, GEN (now {formatGen(stats.min_stake)})
                  <input className="field amount" value={minStake} onChange={(e) => setMinStake(e.target.value)} placeholder={formatGen(stats.min_stake)} inputMode="decimal" />
                </label>
                <label className="eyebrow">
                  Maximum stake, GEN (now {formatGen(stats.max_stake)})
                  <input className="field amount" value={maxStake} onChange={(e) => setMaxStake(e.target.value)} placeholder={formatGen(stats.max_stake)} inputMode="decimal" />
                </label>
                <label className="eyebrow">
                  Resolution window, hours (now {Math.round(stats.resolution_window / 3600)})
                  <input className="field amount" value={windowHours} onChange={(e) => setWindowHours(e.target.value)} placeholder={String(Math.round(stats.resolution_window / 3600))} inputMode="numeric" />
                </label>
              </div>
              <button
                className="btn"
                style={{ marginTop: "0.9rem" }}
                disabled={write.busy}
                onClick={() => {
                  const nextFee = feeBps.trim() ? Number(feeBps) : stats.protocol_fee_bps;
                  const nextMin = minStake.trim() ? parseGen(minStake) : BigInt(stats.min_stake);
                  const nextMax = maxStake.trim() ? parseGen(maxStake) : BigInt(stats.max_stake);
                  const nextWindow = windowHours.trim()
                    ? Number(windowHours) * 3600
                    : stats.resolution_window;
                  if (nextMin === null || nextMax === null || !Number.isFinite(nextFee)) return;
                  void write.run(
                    (from) => submitSetParams(from, nextFee, nextMin.toString(), nextMax.toString(), nextWindow),
                    { onAccepted: refresh, successMessage: "Parameters updated." },
                  );
                }}
              >
                Save parameters
              </button>
            </section>
          </div>
        </>
      )}
    </>
  );
}
