"use server";

import { isDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-range-presets";

import { getTalentAcquisitionDashboardData } from "./queries";
import type { TalentAcquisitionDashboardData } from "./types";

/** Server-action entry point for the dashboard's `useQuery` — same "fall back rather than throw" convention as `fetchWorkforceDashboard`. */
export async function fetchTalentAcquisitionDashboard(preset: string): Promise<TalentAcquisitionDashboardData | null> {
  const safePreset: DateRangePreset = isDateRangePreset(preset) ? preset : "current_month";
  return getTalentAcquisitionDashboardData(resolveDateRangePreset(safePreset));
}
