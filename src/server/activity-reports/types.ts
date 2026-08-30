import type { ActivityReportStatus } from "@/db/schema";

export type ActivityReportRow = {
  id: string;
  date: string;
  status: ActivityReportStatus;
  timeIn: string | null;
  timeOut: string | null;
  otHours: string | null;
  itemCount: number;
};

export type ActivityReportFilters = {
  /** `yyyy-MM-dd`. */
  from?: string;
  /** `yyyy-MM-dd`. */
  to?: string;
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type ActivityReportListResult = {
  reports: ActivityReportRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type ActivityReportLineItem = {
  id: string;
  activityCode: string;
  activityName: string;
  description: string;
  issueBlockers: string | null;
};

export type ActivityReportDetail = {
  id: string;
  date: string;
  status: ActivityReportStatus;
  timeIn: string | null;
  timeOut: string | null;
  otHours: string | null;
  items: ActivityReportLineItem[];
};

export type ClientOption = {
  id: string;
  name: string;
};

/** Prefilled state for the Export Report dialog — employee identity and the client/project pickers' defaults. */
export type ActivityReportExportDefaults = {
  employeeName: string;
  clientOptions: ClientOption[];
  defaultClientName: string;
  defaultProjectName: string;
};

export type ActivityReportMonitoringFilters = {
  employeeId?: string;
  status?: ActivityReportStatus;
  /** `yyyy-MM-dd`. */
  from?: string;
  /** `yyyy-MM-dd`. */
  to?: string;
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type ActivityReportMonitoringRow = ActivityReportRow & {
  employeeId: string;
  employeeName: string;
  teamName: string | null;
};

export type ActivityReportMonitoringListResult = {
  reports: ActivityReportMonitoringRow[];
  total: number;
  page: number;
  pageSize: number;
};
