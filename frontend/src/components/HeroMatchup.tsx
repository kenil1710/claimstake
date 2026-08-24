"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * The hero's one orchestrated moment.
 *
 * Rather than decorate the hero, this plays the entire product in a loop: a
 * claim appears, the challenger stakes against it, a defender matches, the
 * validators read, and a verdict slides the seam. Someone who watches one
 * cycle understands ClaimStake without reading the copy beside it.
 *
 * The stake figures are equal on purpose — the contract forces them to match,
 * and the centred seam in phase 2 is the visual statement of that rule.
 *
 * Under `prefers-reduced-motion` the cycle does not run at all; the settled
 * state is rendered once, statically, which is the most informative single
 * frame of the five.
 */

const PHASES = [
  { at: 0, label: "A claim is published" },
  { at: 1500, label: "Someone stakes against it" },
  { at: 3000, label: "Someone takes the other side" },
  { at: 4600, label: "Validators read the source" },
  { at: 6400, label: "The pot moves" },
] as const;

const CYCLE = 9200;
const SETTLED = 4;

export function HeroMatchup() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(reduce ? SETTLED : 0);

  useEffect(() => {
    if (reduce) return;
    const timers = PHASES.map((p, i) => setTimeout(() => setPhase(i), p.at));
    const loop = setInterval(() => {
      PHASES.forEach((p, i) => setTimeout(() => setPhase(i), p.at));
    }, CYCLE);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(loop);
    };
  }, [reduce]);

  const challengerIn = phase >= 1;
  const defenderIn = phase >= 2;
  const judging = phase === 3;
  const settled = phase >= 4;

  // Centre while both sides are live; flood the challenger once FALSE lands.
  const split = settled ? 87 : defenderIn ? 50 : challengerIn ? 100 : 0;

  return (
    <div
      className="card"
      style={{
        padding: "1.4rem",
        background: "color-mix(in srgb, var(--surface) 82%, transparent)",
        backdropFilter: "blur(6px)",
        position: "relative",
        zIndex: 2,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.1rem" }}>
        <span className="eyebrow">Dispute #041</span>
        <span style={{ flex: 1 }} />
        <AnimatePresence mode="wait">
          <motion.span
            key={phase}
            className="eyebrow"
            initial={reduce ? false : { opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 5 }}
            transition={{ duration: 0.3 }}
            style={{ color: "var(--text-dim)" }}
          >
            {PHASES[phase].label}
          </motion.span>
        </AnimatePresence>
      </div>

      <p
        className="display"
        style={{ fontSize: "1.45rem", lineHeight: 1.22, marginBottom: "1.5rem", minHeight: "2.4em" }}
      >
        The Eiffel Tower is located in London, England.
      </p>

      {/* ── Stakes ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "0.55rem",
        }}
      >
        <div>
          <div className="eyebrow" style={{ color: settled ? "var(--challenger)" : "var(--text-faint)" }}>
            Challenger · false
          </div>
          <motion.div
            className="amount"
            style={{ fontSize: "1.15rem", color: "var(--challenger)", marginTop: "0.15rem" }}
            animate={{ opacity: challengerIn ? 1 : 0.22 }}
            transition={{ duration: 0.4 }}
          >
            0.10 <span style={{ fontSize: "0.68rem", opacity: 0.65, fontWeight: 600 }}>GEN</span>
          </motion.div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div className="eyebrow">Defender · true</div>
          <motion.div
            className="amount"
            style={{
              fontSize: "1.15rem",
              color: settled ? "var(--text-faint)" : "var(--defender)",
              marginTop: "0.15rem",
            }}
            animate={{ opacity: defenderIn ? 1 : 0.22 }}
            transition={{ duration: 0.4 }}
          >
            0.10 <span style={{ fontSize: "0.68rem", opacity: 0.65, fontWeight: 600 }}>GEN</span>
          </motion.div>
        </div>
      </div>

      {/* ── The meter ──────────────────────────────────────────────────── */}
      <div
        className={`meter ${settled ? "meter--challenger-won" : ""}`}
        style={{ ["--split" as string]: `${split}%`, height: "3.25rem" }}
        aria-hidden="true"
      >
        <div className="meter__edge" />
        <div className="meter__fill" />
        {judging ? (
          <motion.div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)",
            }}
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          />
        ) : null}
      </div>

      {/* ── Outcome ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          marginTop: "1rem",
          minHeight: "2rem",
        }}
      >
        <AnimatePresence>
          {settled ? (
            <motion.div
              key="verdict"
              initial={reduce ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.34, ease: [0.16, 0.84, 0.24, 1] }}
              style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}
            >
              <span
                className="chip chip-solid"
                style={{ background: "var(--challenger)", color: "#14090a" }}
              >
                False
              </span>
              <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                Challenger takes{" "}
                <span className="amount" style={{ color: "var(--text)" }}>
                  0.19 GEN
                </span>
              </span>
            </motion.div>
          ) : (
            <motion.span
              key="pending"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ fontSize: "0.85rem", color: "var(--text-faint)" }}
            >
              {judging ? "Five validators fetching the page…" : "Pot held in escrow"}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
