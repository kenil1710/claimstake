"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { getUserHistory } from "@/lib/contract";
import { useWallet } from "@/components/WalletProvider";
import { DisputeCard, EmptyState, ErrorNote, Loading, PageHeader, Stat } from "@/components/ui";
import { formatGen, sameAddress, shortAddress } from "@/lib/format";

/**
 * Your record — or anyone's.
 *
 * The address is a field rather than a fixed read of the connected wallet,
 * because the interesting use is looking up the other party before deciding
 * whether to take their seat. A record that only ever shows you yourself is a
 * profile page; this is a lookup.
 */
export default function RecordPage() {
  const { account } = useWallet();
  const [lookup, setLookup] = useState("");
  const subject = (lookup.trim() || account || "").trim();
  const valid = /^0x[0-9a-fA-F]{40}$/.test(subject);

  const { data, error, isLoading } = useSWR(valid ? ["history", subject] : null, () => getUserHistory(subject), {
    refreshInterval: 20_000,
  });

  const settled = (data?.disputes ?? []).filter((row) => row.status === "RESOLVED");
  const netWei = settled.reduce((total, row) => {
    const stake = BigInt(row.side === "challenger" ? row.challenger_stake : row.defender_stake);
    if (row.verdict === "INCONCLUSIVE") return total;
    return sameAddress(row.winner, subject) ? total + BigInt(row.payout) - stake : total - stake;
  }, 0n);

  return (
    <>
      <PageHeader
        eyebrow="Wins, losses and open positions"
        title={lookup.trim() && !sameAddress(lookup, account) ? "Their record" : "Your record"}
        lede="Every dispute an address has been a party to, on either side."
      />

      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <input
          className="field num"
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          placeholder={account ? `${account} (yours)` : "0x… look up any address"}
          style={{ flex: 1, minWidth: "280px", fontSize: "0.82rem" }}
          aria-label="Address to look up"
        />
        {lookup ? (
          <button className="btn btn-ghost" onClick={() => setLookup("")}>
            Back to mine
          </button>
        ) : null}
      </div>

      {!account && !lookup ? (
        <EmptyState
          title="Nothing to show yet"
          body="Connect a wallet to see your own record, or paste any address to look someone else up."
        />
      ) : !valid ? (
        <ErrorNote message="That is not a 20-byte hex address." />
      ) : error ? (
        <ErrorNote message="Could not read that record from the chain." />
      ) : isLoading ? (
        <Loading />
      ) : !data ? null : (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "1px",
              background: "var(--line)",
              border: "1px solid var(--line)",
              marginBottom: "2.25rem",
            }}
          >
            <div style={{ background: "var(--surface)", padding: "1rem 1.1rem" }}>
              <Stat label="Won" value={String(data.wins)} tone="var(--defender)" />
            </div>
            <div style={{ background: "var(--surface)", padding: "1rem 1.1rem" }}>
              <Stat label="Lost" value={String(data.losses)} tone="var(--challenger)" />
            </div>
            <div style={{ background: "var(--surface)", padding: "1rem 1.1rem" }}>
              <Stat label="Disputes" value={String(data.total)} />
            </div>
            <div style={{ background: "var(--surface)", padding: "1rem 1.1rem" }}>
              <Stat
                label="Net on settled"
                value={`${netWei >= 0n ? "+" : ""}${formatGen(netWei)} GEN`}
                tone={netWei >= 0n ? "var(--defender)" : "var(--challenger)"}
              />
            </div>
          </section>

          <p className="num" style={{ fontSize: "0.78rem", color: "var(--text-faint)", marginBottom: "1.5rem" }}>
            {shortAddress(data.address, 10, 8)}
          </p>

          {data.disputes.length === 0 ? (
            <EmptyState
              title="No disputes yet"
              body={
                sameAddress(subject, account)
                  ? "You have not filed or defended anything. Both sides of the market are open."
                  : "This address has never been a party to a dispute."
              }
              action={
                sameAddress(subject, account) ? (
                  <Link href="/challenge" className="btn">
                    File a challenge
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div style={{ display: "grid", gap: "1.1rem", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
              {data.disputes.map((row) => (
                <div key={row.id}>
                  <div
                    className="eyebrow"
                    style={{ marginBottom: "0.4rem", color: row.side === "challenger" ? "var(--challenger)" : "var(--defender)" }}
                  >
                    Stood as {row.side}
                    {row.status === "RESOLVED" && row.verdict !== "INCONCLUSIVE"
                      ? sameAddress(row.winner, subject)
                        ? ` · won ${formatGen(row.payout)} GEN`
                        : " · lost the stake"
                      : ""}
                  </div>
                  <DisputeCard dispute={row} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
