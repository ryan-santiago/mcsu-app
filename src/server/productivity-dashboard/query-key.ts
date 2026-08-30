import type { DateRangePreset } from "@/lib/date-range-presets";

export const productivityDashboardQueryKey = (preset: DateRangePreset) => ["productivity-dashboard", preset] as const;
