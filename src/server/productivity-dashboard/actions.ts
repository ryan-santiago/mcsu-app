"use server";

import { isDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-range-presets";

import { getProductivityDashboardData } from "./queries";
import type { ProductivityDashboardData } from "./types";

/** Server-action entry point for the dashboard's `useQuery` — same "fall back rather than throw" convention as `fetchWorkforceDashboard`. */
export async function fetchProductivityDashboard(preset: string): Promise<ProductivityDashboardData> {
  const safePreset: DateRangePreset = isDateRangePreset(preset) ? preset : "current_month";
  return getProductivityDashboardData(resolveDateRangePreset(safePreset));
}
