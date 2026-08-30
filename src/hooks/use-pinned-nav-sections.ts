"use client";

import * as React from "react";

/**
 * Which collapsible sidebar sections (Staff Augmentation, One-Lot Project,
 * and each individual One-Lot project's own row) the user has pinned open —
 * a per-device display preference, same `localStorage` + `useSyncExternalStore`
 * pattern as `useViewMode` (not `useState`+`useEffect`: this app's lint config
 * forbids `setState` inside an effect). Nothing is pinned by default, so
 * every collapsible section starts closed until the user pins one open.
 */
const STORAGE_KEY = "mcsu:pinned-nav-sections";

function readRaw(): string {
  return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
}

function parse(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

// `useSyncExternalStore` needs a referentially-stable snapshot for an unchanged
// value — returning the raw stored string (not a freshly-built array/Set each
// call) is what keeps that stable; the string is parsed separately, memoized.
function getSnapshot(): string {
  return readRaw();
}

function getServerSnapshot(): string {
  return "[]";
}

export function usePinnedNavSections() {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pinned = React.useMemo(() => new Set(parse(raw)), [raw]);

  const togglePin = React.useCallback((key: string) => {
    const current = parse(readRaw());
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    const value = JSON.stringify(next);
    window.localStorage.setItem(STORAGE_KEY, value);
    // `storage` events only fire in *other* tabs by default — dispatch one
    // manually so this tab's own subscribers (i.e. this hook, right now) re-check too.
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: value }));
  }, []);

  return {
    isPinned: (key: string) => pinned.has(key),
    togglePin,
  };
}
