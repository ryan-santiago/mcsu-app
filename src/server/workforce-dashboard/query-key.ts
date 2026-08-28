import type { DateRangePreset } from "@/lib/date-range-presets";

export const workforceDashboardQueryKey = (preset: DateRangePreset) => ["workforce-dashboard", preset] as const;
