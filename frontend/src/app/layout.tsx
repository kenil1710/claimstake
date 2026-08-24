import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

/*
 * Two faces, each doing one job.
 *
 * Archivo sets every headline and every figure. It is a grotesque with a
 * slightly condensed, athletic cut — at 800/900 it carries the weight a
 * matchup needs without the neutrality of the usual interface sans, and its
 * tabular figures let a column of stakes line up down a docket.
 *
 * Inter carries body copy and controls, where legibility at 14–16px matters
 * more than personality.
 *
 * Deliberately NO monospace face. Money and addresses use Inter and Archivo
 * with `tabular-nums`, which buys the alignment a ledger needs without
 * dragging a terminal connotation into a product that is not a terminal.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClaimStake — put money where your mouth is",
  description:
    "Challenge any claim on the internet. Stake against it. GenLayer validators read the source and settle who was right. Winner takes the pot.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${inter.variable}`}>
        {/* Ambient plotting grid. Fixed and inert; every surface sits above it. */}
        <div className="gridfield" aria-hidden="true" />
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
