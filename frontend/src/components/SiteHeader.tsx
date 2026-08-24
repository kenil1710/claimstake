"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { Logo } from "@/components/Logo";
import { formatGen, shortAddress } from "@/lib/format";
import { NETWORK_LABEL } from "@/lib/genlayer";

/**
 * The APP header. The marketing pages deliberately do not use this one — they
 * have no wallet, no balance and no network state, because nothing on them
 * touches the chain. Keeping the two chromes separate is what stops the
 * landing page from quietly becoming another app screen.
 */
const NAV = [
  { href: "/docket", label: "Docket" },
  { href: "/docket/open", label: "Open seats" },
  { href: "/challenge", label: "Challenge" },
  { href: "/history", label: "Your record" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { account, balance, hasWallet, connecting, connect, disconnect, onWrongNetwork, switchNetwork } =
    useWallet();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        borderBottom: "1px solid var(--line)",
        background: "color-mix(in srgb, var(--void) 88%, transparent)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="shell"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1.25rem",
          height: "62px",
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }} aria-label="ClaimStake home">
          <Logo size={22} />
        </Link>

        <nav
          className="scroll-x"
          style={{ display: "flex", gap: "1.35rem", alignItems: "center", flex: 1, minWidth: 0 }}
        >
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  color: active ? "var(--text)" : "var(--text-dim)",
                  borderBottom: active ? "1px solid var(--text)" : "1px solid transparent",
                  paddingBottom: "2px",
                  transition: "color 150ms ease",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <span className="eyebrow hide-sm" style={{ whiteSpace: "nowrap" }}>
          {NETWORK_LABEL}
        </span>

        {onWrongNetwork ? (
          <button className="btn btn-sm btn-challenger" onClick={() => void switchNetwork()}>
            Switch to {NETWORK_LABEL}
          </button>
        ) : account ? (
          <button
            className="btn btn-sm btn-ghost"
            onClick={disconnect}
            title="Disconnect"
            style={{ gap: "0.6rem" }}
          >
            <span className="num">{shortAddress(account, 4, 4)}</span>
            {balance !== null ? (
              <span className="num" style={{ color: "var(--text-faint)" }}>
                {formatGen(balance, 3)} GEN
              </span>
            ) : null}
          </button>
        ) : (
          <button
            className="btn btn-sm"
            onClick={() => void connect()}
            disabled={connecting || !hasWallet}
            title={hasWallet ? undefined : "No browser wallet detected"}
          >
            {connecting ? "Connecting…" : hasWallet ? "Connect wallet" : "No wallet found"}
          </button>
        )}
      </div>
    </header>
  );
}
