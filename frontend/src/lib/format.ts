/**
 * Display formatting. Every money value arrives as a wei STRING and stays a
 * bigint until the last moment — 100 GEN is 1e20, which a JS number cannot
 * hold exactly.
 */

const WEI_PER_GEN = 10n ** 18n;

/** Wei to a short GEN string: "0.1", "12.5", "0.0001". Trailing zeros trimmed. */
export function formatGen(wei: string | bigint, maxDecimals = 4): string {
  let value: bigint;
  try {
    value = typeof wei === "bigint" ? wei : BigInt(wei || "0");
  } catch {
    return "0";
  }
  const negative = value < 0n;
  if (negative) value = -value;

  const whole = value / WEI_PER_GEN;
  const fraction = value % WEI_PER_GEN;
  if (fraction === 0n) return `${negative ? "-" : ""}${whole}`;

  const padded = fraction.toString().padStart(18, "0").slice(0, maxDecimals).replace(/0+$/, "");
  // A tiny non-zero amount must not render as a flat "0" — it reads as free.
  if (!padded) return `${negative ? "-" : ""}${whole}.${"0".repeat(maxDecimals - 1)}1…`;
  return `${negative ? "-" : ""}${whole}.${padded}`;
}

/** A GEN string from a form field back to wei, or null if it is not a number. */
export function parseGen(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") return null;
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > 18) return null;
  try {
    return BigInt(whole || "0") * WEI_PER_GEN + BigInt((fraction).padEnd(18, "0") || "0");
  } catch {
    return null;
  }
}

/** "0x1234…cdef" — enough to recognise, short enough to sit in a table. */
export function shortAddress(address: string, lead = 6, tail = 4): string {
  if (!address || address.length < lead + tail + 2) return address ?? "";
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/** Epoch seconds to a readable UTC stamp. The contract's clock is UTC. */
export function formatEpoch(epoch: number): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "in 4m 12s" / "3h ago". Signed against now, for join deadlines. */
export function formatRelative(epoch: number, now = Date.now()): string {
  if (!epoch) return "—";
  const deltaSec = Math.round(epoch - now / 1000);
  const ahead = deltaSec > 0;
  let remaining = Math.abs(deltaSec);

  const days = Math.floor(remaining / 86400);
  remaining -= days * 86400;
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining - minutes * 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && !days) parts.push(`${minutes}m`);
  if (!days && !hours && !minutes) parts.push(`${seconds}s`);

  const body = parts.slice(0, 2).join(" ");
  return ahead ? `in ${body}` : `${body} ago`;
}

/** Hostname only, for the source chip. Falls back to the raw string. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Basis points as a percentage: 500 -> "5%". */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
