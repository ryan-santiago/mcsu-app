import { endOfMonth, startOfMonth, startOfToday } from "date-fns";

/**
 * The Activity Report search's default filter — the current calendar month.
 *
 * Shared by the server page (which prefetches with it) and the client view
 * (whose initial filter state must match exactly, or the first client render
 * refetches with a slightly different query key than what was prefetched) —
 * same reasoning as `defaultAuditRange()` in `src/lib/audit-registry.ts`.
 */
export function defaultActivityReportRange(): { from: Date; to: Date } {
  const today = startOfToday();
  return { from: startOfMonth(today), to: endOfMonth(today) };
}

/** `"08:00:00"` (Postgres `time`'s string mode) → `"08:00"` for the form/display. */
export function formatTimeOfDay(value: string): string {
  return value.slice(0, 5);
}
