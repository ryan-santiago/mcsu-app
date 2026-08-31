import type { BreakdownRow, TrendPoint } from "@/server/workforce-dashboard/types";

export type { BreakdownRow, TrendPoint };

export type TalentAcquisitionDashboardData = {
  openRequests: number;
  /** Applications created in the selected range. */
  candidatesSourced: number;
  /** Applications migrated to Employee in the selected range. */
  migratedThisRange: number;
  /** Average days from request creation to hire, for applications hired in the range. `null` if none hired. */
  timeToFillAvgDays: number | null;
  /** L1, L2, Client Interview, L3, Final Interview, Migrated — fixed pipeline order, not sorted by count. */
  funnelBreakdown: BreakdownRow[];
  applicationsTrend: TrendPoint[];
  sourceBreakdown: BreakdownRow[];
  clientBreakdown: BreakdownRow[];
};
