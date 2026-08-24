"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { CONTRACT_ADDRESS, NETWORK_LABEL, explorerUrl } from "@/lib/genlayer";
import { shortAddress } from "@/lib/format";

const REPO = "https://github.com/kenil1710/claimstake";

/**
 * The network line is derived from NETWORK_LABEL rather than written out.
 *
 * Hardcoding a network name into the footer is how a deployment ends up
 * telling everyone it runs on a chain it was moved off two weeks ago. The
 * label follows NEXT_PUBLIC_NETWORK, so it is right on every deployment
 * without anyone remembering to edit it.
 */
export function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: "auto" }}>
      <div
        className="shell"
        style={{
          display: "flex",
          gap: "2rem",
          flexWrap: "wrap",
          justifyContent: "space-between",
          paddingBlock: "2.5rem 1.5rem",
        }}
      >
        <div style={{ maxWidth: "30ch" }}>
          <Logo size={22} />
          <p style={{ fontSize: "0.82rem", color: "var(--text-faint)", marginTop: "0.75rem", lineHeight: 1.6 }}>
            Adversarial fact-checking. Two sides, equal money, a validator network
            that reads the source and settles it.
          </p>
        </div>

        <nav style={{ display: "flex", gap: "3rem", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "0.55rem", alignContent: "start" }}>
            <div className="eyebrow">Product</div>
            <Link href="/docket" className="link" style={{ fontSize: "0.85rem" }}>
              Docket
            </Link>
            <Link href="/docket/open" className="link" style={{ fontSize: "0.85rem" }}>
              Open seats
            </Link>
            <Link href="/challenge" className="link" style={{ fontSize: "0.85rem" }}>
              File a challenge
            </Link>
          </div>

          <div style={{ display: "grid", gap: "0.55rem", alignContent: "start" }}>
            <div className="eyebrow">Reference</div>
            <Link href="/docs" className="link" style={{ fontSize: "0.85rem" }}>
              How it works
            </Link>
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer noopener"
              className="link"
              style={{ fontSize: "0.85rem" }}
            >
              GitHub
            </a>
            <a
              href={explorerUrl("address", CONTRACT_ADDRESS)}
              target="_blank"
              rel="noreferrer noopener"
              className="link num"
              style={{ fontSize: "0.85rem" }}
            >
              {shortAddress(CONTRACT_ADDRESS)}
            </a>
          </div>
        </nav>
      </div>

      <div className="shell" style={{ paddingBottom: "2rem" }}>
        <hr className="rule" style={{ marginBottom: "1rem" }} />
        <p style={{ fontSize: "0.76rem", color: "var(--text-faint)" }}>
          Running on GenLayer {NETWORK_LABEL}. GEN on this network is test currency and has no
          real-world value.
        </p>
      </div>
    </footer>
  );
}
