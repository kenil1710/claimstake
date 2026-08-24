import type { Metadata } from "next";
import { Bodoni_Moda, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { WalletProvider } from "@/components/WalletProvider";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

/*
 * Three faces, each doing one job.
 *
 * Bodoni Moda sets claims and headings: a didone reads as a notice of record,
 * which is what a disputed claim is here. Public Sans is the US design system's
 * civic face and carries the interface text. IBM Plex Mono holds every number —
 * stakes, addresses, hashes, epochs — so figures stay tabular and columns of
 * money line up down a docket.
 */
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-bodoni",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClaimStake — put money behind a claim",
  description:
    "Two people stake equal amounts on opposite readings of a published claim. A validator network reads the source and settles it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${bodoni.variable} ${publicSans.variable} ${plexMono.variable}`}>
        <WalletProvider>
          <div style={{ position: "relative", zIndex: 1, minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
            <SiteHeader />
            <main style={{ flex: 1, width: "100%", maxWidth: "1120px", margin: "0 auto", padding: "2.5rem 1.25rem 4rem" }}>
              {children}
            </main>
            <footer
              style={{
                borderTop: "1.5px solid var(--ink)",
                padding: "1.25rem",
                textAlign: "center",
              }}
            >
              <span className="eyebrow">
                ClaimStake · an intelligent contract on GenLayer
              </span>
            </footer>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
