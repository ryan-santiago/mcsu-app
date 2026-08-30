import type { ActivityReportFilters, ActivityReportMonitoringFilters } from "./types";

/** Shared between the server page (prefetch) and the client view (read/invalidate). */
export const myActivityReportsQueryKey = (filters: ActivityReportFilters) =>
  ["activity-reports", "list", filters] as const;
export const myActivityReportQueryKey = (id: string) => ["activity-reports", "detail", id] as const;

export const activityReportMonitoringQueryKey = (filters: ActivityReportMonitoringFilters) =>
  ["activity-reports", "monitoring", filters] as const;
export const activityReportMonitoringEmployeeOptionsQueryKey = () =>
  ["activity-reports", "monitoring", "employee-options"] as const;
