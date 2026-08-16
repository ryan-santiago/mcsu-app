import "server-only";

import { and, asc, count, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { activityReport, activityReportItem } from "@/db/schema";
import { formatTimeOfDay } from "@/lib/activity-report-format";
import { requireActiveUser } from "@/server/settings/queries";

import type {
  ActivityReportDetail,
  ActivityReportFilters,
  ActivityReportListResult,
} from "./types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Lists the signed-in user's own daily activity reports for the search
 * table, each carrying its activity count. `requireActiveUser()`, not
 * `authorize()` — this module has no permission gate, same as Settings &
 * Profile. A user with no linked Employee record sees an empty list rather
 * than an error, mirroring `getMyEmployeeDetail`.
 */
export async function listMyActivityReports(filters: ActivityReportFilters = {}): Promise<ActivityReportListResult> {
  const actor = await requireActiveUser();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  if (!actor.employeeId) {
    return { reports: [], total: 0, page, pageSize };
  }

  const clauses: SQL[] = [eq(activityReport.employeeId, actor.employeeId)];
  if (filters.from) clauses.push(gte(activityReport.date, filters.from));
  if (filters.to) clauses.push(lte(activityReport.date, filters.to));
  const where = and(...clauses);

  const rows = await db
    .select({
      id: activityReport.id,
      date: activityReport.date,
      timeIn: activityReport.timeIn,
      timeOut: activityReport.timeOut,
      otHours: activityReport.otHours,
    })
    .from(activityReport)
    .where(where)
    .orderBy(desc(activityReport.date))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db.select({ value: count() }).from(activityReport).where(where);

  const ids = rows.map((row) => row.id);
  const itemCounts =
    ids.length > 0
      ? await db
          .select({ activityReportId: activityReportItem.activityReportId, value: count() })
          .from(activityReportItem)
          .where(inArray(activityReportItem.activityReportId, ids))
          .groupBy(activityReportItem.activityReportId)
      : [];
  const countByReportId = new Map(itemCounts.map((row) => [row.activityReportId, row.value]));

  return {
    reports: rows.map((row) => ({
      id: row.id,
      date: row.date,
      timeIn: formatTimeOfDay(row.timeIn),
      timeOut: formatTimeOfDay(row.timeOut),
      otHours: row.otHours,
      itemCount: countByReportId.get(row.id) ?? 0,
    })),
    total,
    page,
    pageSize,
  };
}

/**
 * Loads one of the signed-in user's own reports, with its activity lines.
 * Returns `null` when the report doesn't exist *or* belongs to someone
 * else — same privacy-preserving "not found" shape as
 * `cancelMyChangeRequest`'s ownership check, so a guessed id never reveals
 * whether it exists.
 */
export async function getMyActivityReportById(id: string): Promise<ActivityReportDetail | null> {
  const actor = await requireActiveUser();
  if (!actor.employeeId) return null;

  const [row] = await db
    .select({
      id: activityReport.id,
      date: activityReport.date,
      timeIn: activityReport.timeIn,
      timeOut: activityReport.timeOut,
      otHours: activityReport.otHours,
    })
    .from(activityReport)
    .where(and(eq(activityReport.id, id), eq(activityReport.employeeId, actor.employeeId)))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select({
      id: activityReportItem.id,
      activityCode: activityReportItem.activityCode,
      activityName: activityReportItem.activityName,
      description: activityReportItem.description,
      issueBlockers: activityReportItem.issueBlockers,
    })
    .from(activityReportItem)
    .where(eq(activityReportItem.activityReportId, id))
    .orderBy(asc(activityReportItem.sortOrder));

  return {
    id: row.id,
    date: row.date,
    timeIn: formatTimeOfDay(row.timeIn),
    timeOut: formatTimeOfDay(row.timeOut),
    otHours: row.otHours,
    items,
  };
}
