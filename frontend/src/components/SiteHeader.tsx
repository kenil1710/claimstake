"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";
import { IS_GASLESS, NETWORK_LABEL } from "@/lib/genlayer";
import { formatGen, shortAddress } from "@/lib/format";

const NAV = [
  { href: "/docket", label: "Docket" },
  { href: "/docket/open", label: "Open seats" },
  { href: "/new", label: "File a claim" },
  { href: "/me", label: "Your record" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { account, balance, connect, disconnect, connecting, hasWallet, onWrongNetwork, switchNetwork } =
    useWallet();

  return (
    <header style={{ borderBottom: "1.5px solid var(--ink)", background: "var(--field-raised)" }}>
      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          padding: "0.85rem 1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "1.25rem",
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
          {/* The mark is the seam itself, reduced to a rule between two blocks. */}
          <span aria-hidden style={{ display: "inline-flex", height: "1.05rem", width: "1.5rem", border: "1.5px solid var(--ink)" }}>
            <span style={{ flex: 1, background: "var(--challenger)" }} />
            <span style={{ flex: 1, background: "var(--defender)" }} />
          </span>
          <span className="display" style={{ fontSize: "1.3rem", letterSpacing: "-0.02em" }}>
            ClaimStake
          </span>
        </Link>

        <nav style={{ display: "flex", gap: "1.1rem", flexWrap: "wrap" }}>
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  fontSize: "0.875rem",
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--ink)" : "var(--ink-soft)",
                  textDecoration: "none",
                  borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
                  paddingBottom: "2px",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <span style={{ flex: 1 }} />

        <span className="eyebrow" title={IS_GASLESS ? "Gasless network — you still need GEN to stake" : undefined}>
          {NETWORK_LABEL}
        </span>

        {onWrongNetwork ? (
          <button className="btn btn-challenger" onClick={() => void switchNetwork()}>
            Switch to {NETWORK_LABEL}
          </button>
        ) : account ? (
          <button
            className="btn btn-ghost"
            onClick={disconnect}
            title="Disconnect"
            style={{ gap: "0.6rem" }}
          >
            <span className="mono" style={{ fontSize: "0.78rem" }}>{shortAddress(account)}</span>
            {balance !== null ? (
              <span className="amount" style={{ fontSize: "0.78rem", color: "var(--gold)" }}>
                {formatGen(balance, 3)} GEN
              </span>
            ) : null}
          </button>
        ) : (
          <button className="btn" onClick={() => void connect()} disabled={connecting || !hasWallet}>
            {!hasWallet ? "Install MetaMask" : connecting ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
