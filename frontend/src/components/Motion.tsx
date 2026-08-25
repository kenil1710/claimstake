"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Motion primitives.
 *
 * Reduced motion is handled HERE rather than at each call site, because a
 * call site that forgets is invisible until someone with the preference set
 * loads the page. Every export below collapses to a plain, instant render when
 * `prefers-reduced-motion` is set — content still appears, it simply does not
 * travel.
 */

const EASE = [0.16, 0.84, 0.24, 1] as const;

export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.62, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Enters from the side its party occupies — challenger from the left, defender
 * from the right. The direction carries the same meaning the colour does, so a
 * card sliding in from the left is already telling you whose case it is.
 */
export function SideReveal({
  children,
  side,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode;
  side: "challenger" | "defender";
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  const from = side === "challenger" ? -34 : 34;
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, x: from }}
      whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.66, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Staggers its children. Pair with `StaggerItem`. */
export function Stagger({
  children,
  gap = 0.08,
  className,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : "hidden"}
      whileInView={reduce ? undefined : "shown"}
      viewport={{ once: true, margin: "-70px" }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={{
        hidden: { opacity: 0, y: 20 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.58, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Counts a number up when it scrolls into view.
 *
 * Takes an already-formatted string apart rather than animating raw wei: money
 * here is a bigint that a JS number cannot hold, so the count runs over the
 * DISPLAY value and never touches the underlying amount.
 */
export function CountUp({
  value,
  decimals = 0,
  durationMs = 1100,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  durationMs?: number;
  suffix?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [counted, setCounted] = useState(0);

  useEffect(() => {
    if (reduce || !inView) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs);
      // Ease-out cubic: fast off the line, settles gently on the real figure.
      setCounted(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, durationMs, reduce]);

  /*
   * Derived during render rather than synced into state by an effect.
   *
   * The reduced-motion reader wants the real figure immediately, and writing
   * it in an effect both costs a cascading render and lets the displayed copy
   * fall out of step with the prop whenever `value` changes after mount.
   */
  const shown = reduce ? value : counted;

  return (
    <span ref={ref} className="num">
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export { motion, useReducedMotion };
