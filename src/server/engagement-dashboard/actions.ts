"use server";

import { isDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-range-presets";

import { getEngagementDashboardData } from "./queries";
import type { EngagementDashboardData } from "./types";

/** Server-action entry point for the dashboard's `useQuery` — falls back to the default preset for anything malformed rather than throwing, since this only ever drives a `<Select>` with a fixed set of values. */
export async function fetchEngagementDashboard(preset: string): Promise<EngagementDashboardData> {
  const safePreset: DateRangePreset = isDateRangePreset(preset) ? preset : "current_month";
  return getEngagementDashboardData(resolveDateRangePreset(safePreset));
}
