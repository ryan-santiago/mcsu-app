"use client";

import * as React from "react";

export const MOBILE_BREAKPOINT = 768;

function subscribe(callback: () => void) {
  const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}

/**
 * Everything else responsive in this app is CSS-only (render both trees,
 * `hidden`/`lg:flex` picks one — see `app-sidebar.tsx`). This is the one
 * exception: a few places need the actual boolean in JS.
 *
 * Built on `useSyncExternalStore` rather than a `useState`+`useEffect` pair —
 * this app's lint config (`react-hooks/set-state-in-effect`) flags
 * synchronous `setState` in an effect body, and reading an external, mutable
 * source (the viewport) is exactly what `useSyncExternalStore` is for. It
 * also solves the SSR case for free: `getServerSnapshot` matches what the
 * server rendered, so hydration never mismatches, then React re-syncs to the
 * real value right after mount.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
