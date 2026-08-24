import { MarketingNav } from "@/components/MarketingNav";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * Marketing chrome. No wallet, no app nav, no chain state — the landing pages
 * sell the idea and hand off to /docket, and keeping their shell separate is
 * what stops them from drifting into being app screens with a hero on top.
 *
 * Full-bleed: these pages manage their own widths section by section, because
 * a hero that stops at the content rail stops looking like a hero.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <MarketingNav />
      <main style={{ flex: 1 }}>{children}</main>
      <SiteFooter />
    </div>
  );
}
