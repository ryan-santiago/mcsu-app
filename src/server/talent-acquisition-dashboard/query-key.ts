import type { DateRangePreset } from "@/lib/date-range-presets";

export const talentAcquisitionDashboardQueryKey = (preset: DateRangePreset) =>
  ["talent-acquisition-dashboard", preset] as const;
