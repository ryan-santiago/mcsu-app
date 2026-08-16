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
