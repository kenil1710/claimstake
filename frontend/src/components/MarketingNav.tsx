"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * The marketing header.
 *
 * Carries no wallet, no balance and no network state — nothing on the landing
 * page touches the chain, so there is nothing to connect for. The single CTA
 * is the door into the app, and it is the only place on the page that leads
 * there other than the closing call.
 */
export function MarketingNav() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        borderBottom: "1px solid var(--line)",
        background: "color-mix(in srgb, var(--void) 86%, transparent)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="shell"
        style={{ display: "flex", alignItems: "center", gap: "1rem", height: "64px" }}
      >
        <Link href="/" style={{ textDecoration: "none" }} aria-label="ClaimStake home">
          <Logo size={24} />
        </Link>

        <span style={{ flex: 1 }} />

        <Link
          href="/docs"
          className="link hide-sm"
          style={{ fontSize: "0.875rem", fontWeight: 500, marginRight: "0.5rem" }}
        >
          How it works
        </Link>

        <Link href="/docket" className="btn btn-sm">
          Launch app
        </Link>
      </div>
    </header>
  );
}
