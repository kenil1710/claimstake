"use client";

import { useSyncExternalStore } from "react";

/**
 * A ticking clock, shared per interval, living OUTSIDE the React tree.
 *
 * Module scope on purpose. The store mutates a cached snapshot, and anything
 * created during render may not be reassigned afterwards — so building it in a
 * `useMemo` is both a lint error and the wrong shape. One store per interval
 * also means twenty dispute cards on a page share a single timer instead of
 * running twenty of their own.
 */
interface Clock {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => number;
  getServerSnapshot: () => number;
}

const CLOCKS = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  const existing = CLOCKS.get(intervalMs);
  if (existing) return existing;

  const listeners = new Set<() => void>();
  let snapshot = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const clock: Clock = {
    subscribe(onChange) {
      listeners.add(onChange);
      if (timer === null) {
        snapshot = Date.now();
        timer = setInterval(() => {
          snapshot = Date.now();
          for (const listener of listeners) listener();
        }, intervalMs);
      }
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    // CACHED, never `() => Date.now()`: getSnapshot must return a stable value
    // between ticks or React re-renders forever.
    getSnapshot: () => snapshot,
    getServerSnapshot: () => 0,
  };
  CLOCKS.set(intervalMs, clock);
  return clock;
}

/**
 * The current time as a subscription rather than a `Date.now()` call in render.
 *
 * Reading the clock while rendering is impure — the same props produce a
 * different tree every pass — and it hides a real bug: a "closes in 4m"
 * countdown rendered from `Date.now()` freezes at whatever the clock said when
 * the component last happened to re-render, going stale exactly when it matters.
 *
 * Returns 0 until the first tick, on the server and on the first client pass.
 * Callers must treat 0 as "not known yet" rather than as 1970 — which would
 * mark every open dispute as closed on first paint.
 */
export function useNow(intervalMs = 1000): number {
  const clock = clockFor(intervalMs);
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getServerSnapshot);
}
