/**
 * The ClaimStake mark.
 *
 * Two wedges driving at each other across a slanted gap — the same diagonal
 * seam the matchup meter is built on, at 24px. The mark is not a separate
 * decoration bolted onto the product; it is the product's one device shrunk to
 * a glyph, so the meter on a dispute card and the logo in the header are
 * visibly the same idea.
 *
 * Left is always the challenger, right always the defender, matching every
 * other surface in the interface.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Challenger — drives right, blunt outer edge, angled inner face. */}
      <path d="M2 3 L15 3 L11 29 L2 29 Z" fill="var(--challenger)" />
      {/* Defender — mirrored, meeting the challenger across the seam. */}
      <path d="M30 3 L21 3 L17 29 L30 29 Z" fill="var(--defender)" />
    </svg>
  );
}

export function Logo({ size = 26, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
      <LogoMark size={size} />
      {showText ? (
        <span
          className="display"
          style={{ fontSize: "1.0625rem", letterSpacing: "-0.028em", color: "var(--text)" }}
        >
          ClaimStake
        </span>
      ) : null}
    </span>
  );
}
