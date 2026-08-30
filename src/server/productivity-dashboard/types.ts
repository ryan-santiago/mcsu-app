import type { BreakdownRow, TrendPoint } from "@/server/workforce-dashboard/types";

export type { BreakdownRow, TrendPoint };

export type ActivityReportDashboardData = {
  /** Distinct employees who filed at least one report in the range, out of every active employee — the one metric this dashboard has that nothing else in the app computes: who hasn't reported yet. */
  filingRate: { filed: number; totalActive: number };
  reportsSubmitted: number;
  onLeave: number;
  totalOtHours: number;
  filingTrend: TrendPoint[];
  teamBreakdown: BreakdownRow[];
  statusBreakdown: BreakdownRow[];
};

export type CertificationsDashboardData = {
  certificationsAdded: number;
  employeesCertified: number;
  /** How many of this range's certifications carry a `credentialUrl` — a rough proxy for "externally verifiable" vs. upload-only. */
  withVerificationLink: { withLink: number; total: number };
  certificationTrend: TrendPoint[];
  teamBreakdown: BreakdownRow[];
  /** Most common certificate titles in the range, e.g. repeat AWS/PMP badges across the team. */
  topTitles: BreakdownRow[];
};

export type ProductivityDashboardData = {
  activityReport: ActivityReportDashboardData | null;
  certifications: CertificationsDashboardData | null;
};
