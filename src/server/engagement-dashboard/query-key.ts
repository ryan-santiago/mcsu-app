import type { DateRangePreset } from "@/lib/date-range-presets";

export const engagementDashboardQueryKey = (preset: DateRangePreset) => ["engagement-dashboard", preset] as const;
