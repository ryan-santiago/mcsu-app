import "server-only";

import { and, asc, count, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { activityReport, activityReportItem, client, employee, team } from "@/db/schema";
import { formatTimeOfDay } from "@/lib/activity-report-format";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { authorize } from "@/lib/session";
import { requireActiveUser } from "@/server/settings/queries";

import type {
  ActivityReportDetail,
  ActivityReportFilters,
  ActivityReportListResult,
  ActivityReportMonitoringFilters,
  ActivityReportMonitoringListResult,
  ClientOption,
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
      status: activityReport.status,
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
      status: row.status,
      timeIn: row.timeIn ? formatTimeOfDay(row.timeIn) : null,
      timeOut: row.timeOut ? formatTimeOfDay(row.timeOut) : null,
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
      status: activityReport.status,
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
    status: row.status,
    timeIn: row.timeIn ? formatTimeOfDay(row.timeIn) : null,
    timeOut: row.timeOut ? formatTimeOfDay(row.timeOut) : null,
    otHours: row.otHours,
    items,
  };
}

/**
 * Every one of the signed-in user's reports (with their activity lines) in
 * `[from, to]`, unpaginated — the Export Report PDF's data source. Bounded to
 * a single calendar month by its caller, so an unpaginated read is safe.
 */
export async function listMyActivityReportsForExport(from: string, to: string): Promise<ActivityReportDetail[]> {
  const actor = await requireActiveUser();
  if (!actor.employeeId) return [];

  const rows = await db
    .select({
      id: activityReport.id,
      date: activityReport.date,
      status: activityReport.status,
      timeIn: activityReport.timeIn,
      timeOut: activityReport.timeOut,
      otHours: activityReport.otHours,
    })
    .from(activityReport)
    .where(
      and(
        eq(activityReport.employeeId, actor.employeeId),
        gte(activityReport.date, from),
        lte(activityReport.date, to),
      ),
    )
    .orderBy(asc(activityReport.date));

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const items = await db
    .select({
      id: activityReportItem.id,
      activityReportId: activityReportItem.activityReportId,
      activityCode: activityReportItem.activityCode,
      activityName: activityReportItem.activityName,
      description: activityReportItem.description,
      issueBlockers: activityReportItem.issueBlockers,
    })
    .from(activityReportItem)
    .where(inArray(activityReportItem.activityReportId, ids))
    .orderBy(asc(activityReportItem.sortOrder));

  const itemsByReportId = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByReportId.get(item.activityReportId) ?? [];
    list.push(item);
    itemsByReportId.set(item.activityReportId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    status: row.status,
    timeIn: row.timeIn ? formatTimeOfDay(row.timeIn) : null,
    timeOut: row.timeOut ? formatTimeOfDay(row.timeOut) : null,
    otHours: row.otHours,
    items: (itemsByReportId.get(row.id) ?? []).map((item) => ({
      id: item.id,
      activityCode: item.activityCode,
      activityName: item.activityName,
      description: item.description,
      issueBlockers: item.issueBlockers,
    })),
  }));
}

/** Active clients, for the Export Report dialog's Client picker — ungated, same self-service reasoning as the rest of this module. */
export async function listActiveClientOptions(): Promise<ClientOption[]> {
  await requireActiveUser();
  return db
    .select({ id: client.id, name: client.name })
    .from(client)
    .where(eq(client.isActive, true))
    .orderBy(asc(client.name));
}

/** The maximum rows `listActivityReportsForMonitoringExport` will return in one call — see its own comment. */
export const MONITORING_EXPORT_ROW_LIMIT = 5000;

function buildMonitoringWhere(filters: Omit<ActivityReportMonitoringFilters, "page" | "pageSize">): SQL | undefined {
  const clauses: SQL[] = [];
  if (filters.employeeId) clauses.push(eq(activityReport.employeeId, filters.employeeId));
  if (filters.status) clauses.push(eq(activityReport.status, filters.status));
  if (filters.from) clauses.push(gte(activityReport.date, filters.from));
  if (filters.to) clauses.push(lte(activityReport.date, filters.to));
  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

/**
 * Org-wide monitoring list — every employee's reports, not just the
 * caller's own. Gated on `activity_reports:read_all`, unlike every other
 * function in this file (which only checks `requireActiveUser()`).
 */
export async function listActivityReportsForMonitoring(
  filters: ActivityReportMonitoringFilters = {},
): Promise<ActivityReportMonitoringListResult> {
  await authorize("activity_reports:read_all");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const where = buildMonitoringWhere(filters);

  const rows = await db
    .select({
      id: activityReport.id,
      date: activityReport.date,
      status: activityReport.status,
      timeIn: activityReport.timeIn,
      timeOut: activityReport.timeOut,
      otHours: activityReport.otHours,
      employeeId: activityReport.employeeId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      teamName: team.name,
    })
    .from(activityReport)
    .innerJoin(employee, eq(employee.id, activityReport.employeeId))
    .leftJoin(team, eq(team.id, employee.teamId))
    .where(where)
    .orderBy(desc(activityReport.date))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(activityReport)
    .innerJoin(employee, eq(employee.id, activityReport.employeeId))
    .where(where);

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
      status: row.status,
      timeIn: row.timeIn ? formatTimeOfDay(row.timeIn) : null,
      timeOut: row.timeOut ? formatTimeOfDay(row.timeOut) : null,
      otHours: row.otHours,
      itemCount: countByReportId.get(row.id) ?? 0,
      employeeId: row.employeeId,
      employeeName: formatEmployeeDisplayName(row),
      teamName: row.teamName,
    })),
    total,
    page,
    pageSize,
  };
}

/**
 * Unpaginated variant of `listActivityReportsForMonitoring`, for CSV export
 * — same "bounded, no pagination" convention as `listMyActivityReportsForExport`,
 * except here the bound is a row cap (`MONITORING_EXPORT_ROW_LIMIT`) rather
 * than a single calendar month, since a monitor's filters can span an
 * arbitrary date range. The caller (the action wrapper) is responsible for
 * rejecting a request that would exceed the cap rather than silently
 * truncating it.
 */
export async function listActivityReportsForMonitoringExport(
  filters: Omit<ActivityReportMonitoringFilters, "page" | "pageSize">,
): Promise<ActivityReportMonitoringListResult["reports"]> {
  await authorize("activity_reports:read_all");
  const where = buildMonitoringWhere(filters);

  const rows = await db
    .select({
      id: activityReport.id,
      date: activityReport.date,
      status: activityReport.status,
      timeIn: activityReport.timeIn,
      timeOut: activityReport.timeOut,
      otHours: activityReport.otHours,
      employeeId: activityReport.employeeId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      teamName: team.name,
    })
    .from(activityReport)
    .innerJoin(employee, eq(employee.id, activityReport.employeeId))
    .leftJoin(team, eq(team.id, employee.teamId))
    .where(where)
    .orderBy(desc(activityReport.date))
    .limit(MONITORING_EXPORT_ROW_LIMIT + 1);

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

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    status: row.status,
    timeIn: row.timeIn ? formatTimeOfDay(row.timeIn) : null,
    timeOut: row.timeOut ? formatTimeOfDay(row.timeOut) : null,
    otHours: row.otHours,
    itemCount: countByReportId.get(row.id) ?? 0,
    employeeId: row.employeeId,
    employeeName: formatEmployeeDisplayName(row),
    teamName: row.teamName,
  }));
}
