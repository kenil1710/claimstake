import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * App chrome: the wallet header, a content rail, and the shared footer.
 *
 * Everything below this layout touches the chain, which is exactly why the
 * connect button lives here and not in the marketing shell.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <main className="shell" style={{ flex: 1, paddingBlock: "2.75rem 4.5rem" }}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
