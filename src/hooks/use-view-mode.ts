"use client";

import * as React from "react";

import { MOBILE_BREAKPOINT } from "@/hooks/use-is-mobile";

export type ViewMode = "table" | "card";

/**
 * A device preference, not a per-module one — Employees and Projects (the
 * Workforce modules) share this key, so switching to Card in one carries
 * over to the other. `use-pinned-nav-sections.ts` is the other `localStorage`
 * usage in the app, same pattern; `next-themes` is the only non-`useSyncExternalStore`
 * persisted-preference precedent, and it's theme-specific.
 */
const STORAGE_KEY = "mcsu:view-mode";

function readStored(): ViewMode | null {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "table" || value === "card" ? value : null;
}

function subscribe(callback: () => void) {
  const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  query.addEventListener("change", callback);
  window.addEventListener("storage", callback);
  return () => {
    query.removeEventListener("change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): ViewMode {
  return readStored() ?? (window.innerWidth < MOBILE_BREAKPOINT ? "card" : "table");
}

function getServerSnapshot(): ViewMode {
  return "table";
}

/**
 * Defaults to Card on a narrow viewport, Table otherwise — but the moment the
 * user picks one explicitly, that choice is stored and wins from then on, on
 * any device, until they change it again.
 *
 * Built on `useSyncExternalStore` rather than `useState`+`useEffect` — see
 * the comment on `useIsMobile` for why (same `set-state-in-effect` lint rule,
 * same SSR-safety concern).
 */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const mode = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setMode = React.useCallback((next: ViewMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    // `storage` events only fire in *other* tabs by default — dispatch one
    // manually so this tab's own subscribers (i.e. this hook, right now)
    // re-check too.
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: next }));
  }, []);

  return [mode, setMode];
}
