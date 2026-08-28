import { endOfDay, startOfDay, startOfMonth, subMonths } from "date-fns";

/**
 * The four ranges the Workforce Dashboard's date filter offers. Kept as a
 * closed set of presets (not a free date picker) since every widget's query
 * is written around whole-range aggregates, not arbitrary spans — same
 * "small fixed vocabulary over a general one" choice `IN_PROGRESS_STATUSES`
 * etc. make elsewhere in this app.
 */
export const DATE_RANGE_PRESETS = ["current_month", "3_months", "6_months", "1_year"] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  current_month: "Current month",
  "3_months": "Last 3 months",
  "6_months": "Last 6 months",
  "1_year": "Last 1 year",
};

export function isDateRangePreset(value: string): value is DateRangePreset {
  return (DATE_RANGE_PRESETS as readonly string[]).includes(value);
}

/**
 * `from` is the start of the month N months back (inclusive), `to` is the
 * end of today (inclusive) — so "Current month" is month-to-date, not a
 * full calendar month, matching how every other range here is "N months
 * up to now" rather than a fixed historical window.
 */
export function resolveDateRangePreset(preset: DateRangePreset, now: Date = new Date()): { from: Date; to: Date } {
  const monthsBack: Record<DateRangePreset, number> = {
    current_month: 0,
    "3_months": 2,
    "6_months": 5,
    "1_year": 11,
  };
  return {
    from: startOfDay(startOfMonth(subMonths(now, monthsBack[preset]))),
    to: endOfDay(now),
  };
}
