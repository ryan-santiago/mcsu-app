import "server-only";

import { and, count, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { certification, employee, team } from "@/db/schema";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { can, hasUnrestrictedAccess } from "@/lib/rbac";
import { authorize, type CurrentUser } from "@/lib/session";
import { requireActiveUser } from "@/server/settings/queries";

import type {
  CertificationDetail,
  CertificationDownloadRecord,
  CertificationFilters,
  CertificationListResult,
  CertificationMonitoringFilters,
  CertificationMonitoringListResult,
} from "./types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** The maximum rows `listCertificationsForMonitoringExport` will return in one call — see its own comment. */
export const MONITORING_EXPORT_ROW_LIMIT = 5000;

/**
 * Lists the signed-in user's own certification records. `requireActiveUser()`,
 * not `authorize()` — this module has no permission gate, same as Activity
 * Report. A user with no linked Employee record sees an empty list rather
 * than an error, mirroring `listMyActivityReports`.
 */
export async function listMyCertifications(filters: CertificationFilters = {}): Promise<CertificationListResult> {
  const actor = await requireActiveUser();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  if (!actor.employeeId) {
    return { certifications: [], total: 0, page, pageSize };
  }

  const clauses: SQL[] = [eq(certification.employeeId, actor.employeeId)];
  const search = filters.search?.trim();
  if (search) clauses.push(ilike(certification.title, `%${search}%`));
  if (filters.from) clauses.push(gte(certification.dateAcquired, filters.from));
  if (filters.to) clauses.push(lte(certification.dateAcquired, filters.to));
  const where = and(...clauses);

  const rows = await db
    .select({
      id: certification.id,
      title: certification.title,
      dateAcquired: certification.dateAcquired,
      credentialUrl: certification.credentialUrl,
      fileName: certification.fileName,
      fileSize: certification.fileSize,
    })
    .from(certification)
    .where(where)
    .orderBy(desc(certification.dateAcquired))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db.select({ value: count() }).from(certification).where(where);

  return { certifications: rows, total, page, pageSize };
}

/**
 * Loads one of the signed-in user's own certifications. Returns `null` when
 * it doesn't exist *or* belongs to someone else — same privacy-preserving
 * "not found" shape as `getMyActivityReportById`.
 */
export async function getMyCertificationById(id: string): Promise<CertificationDetail | null> {
  const actor = await requireActiveUser();
  if (!actor.employeeId) return null;

  const [row] = await db
    .select({
      id: certification.id,
      title: certification.title,
      dateAcquired: certification.dateAcquired,
      credentialUrl: certification.credentialUrl,
      fileName: certification.fileName,
      fileSize: certification.fileSize,
      mimeType: certification.mimeType,
      employeeId: certification.employeeId,
    })
    .from(certification)
    .where(and(eq(certification.id, id), eq(certification.employeeId, actor.employeeId)))
    .limit(1);

  return row ?? null;
}

/**
 * Used only by the authenticated download route handler
 * (`src/app/api/certifications/[id]/file/route.ts`) — a monitor (holding
 * `certifications:read_all`) or an admin can download *any* employee's
 * certificate file, not just their own. Returns `null` (not-found, same
 * privacy-preserving shape) rather than throwing when access is denied, so
 * the route can respond with a plain 404.
 */
export async function getCertificationForDownload(
  id: string,
  actor: CurrentUser,
): Promise<CertificationDownloadRecord | null> {
  const [row] = await db
    .select({
      id: certification.id,
      title: certification.title,
      dateAcquired: certification.dateAcquired,
      credentialUrl: certification.credentialUrl,
      fileName: certification.fileName,
      fileSize: certification.fileSize,
      mimeType: certification.mimeType,
      employeeId: certification.employeeId,
      storageKey: certification.storageKey,
    })
    .from(certification)
    .where(eq(certification.id, id))
    .limit(1);

  if (!row) return null;

  const isOwner = actor.employeeId === row.employeeId;
  const canMonitor = hasUnrestrictedAccess(actor) || can(actor, "certifications:read_all");
  if (!isOwner && !canMonitor) return null;

  return row;
}

function buildMonitoringWhere(
  filters: Omit<CertificationMonitoringFilters, "page" | "pageSize">,
): SQL | undefined {
  const clauses: SQL[] = [];
  if (filters.employeeId) clauses.push(eq(certification.employeeId, filters.employeeId));
  if (filters.from) clauses.push(gte(certification.dateAcquired, filters.from));
  if (filters.to) clauses.push(lte(certification.dateAcquired, filters.to));
  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

/**
 * Org-wide monitoring list — every employee's certifications, not just the
 * caller's own. Gated on `certifications:read_all`, unlike every other
 * function in this file.
 */
export async function listCertificationsForMonitoring(
  filters: CertificationMonitoringFilters = {},
): Promise<CertificationMonitoringListResult> {
  await authorize("certifications:read_all");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const where = buildMonitoringWhere(filters);

  const rows = await db
    .select({
      id: certification.id,
      title: certification.title,
      dateAcquired: certification.dateAcquired,
      credentialUrl: certification.credentialUrl,
      fileName: certification.fileName,
      fileSize: certification.fileSize,
      employeeId: certification.employeeId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      teamName: team.name,
    })
    .from(certification)
    .innerJoin(employee, eq(employee.id, certification.employeeId))
    .leftJoin(team, eq(team.id, employee.teamId))
    .where(where)
    .orderBy(desc(certification.dateAcquired))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(certification)
    .innerJoin(employee, eq(employee.id, certification.employeeId))
    .where(where);

  return {
    certifications: rows.map((row) => ({
      id: row.id,
      title: row.title,
      dateAcquired: row.dateAcquired,
      credentialUrl: row.credentialUrl,
      fileName: row.fileName,
      fileSize: row.fileSize,
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
 * Unpaginated variant of `listCertificationsForMonitoring`, for CSV export
 * — same "bounded, no pagination" convention as Activity Report
 * monitoring's own export query.
 */
export async function listCertificationsForMonitoringExport(
  filters: Omit<CertificationMonitoringFilters, "page" | "pageSize">,
): Promise<CertificationMonitoringListResult["certifications"]> {
  await authorize("certifications:read_all");
  const where = buildMonitoringWhere(filters);

  const rows = await db
    .select({
      id: certification.id,
      title: certification.title,
      dateAcquired: certification.dateAcquired,
      credentialUrl: certification.credentialUrl,
      fileName: certification.fileName,
      fileSize: certification.fileSize,
      employeeId: certification.employeeId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      teamName: team.name,
    })
    .from(certification)
    .innerJoin(employee, eq(employee.id, certification.employeeId))
    .leftJoin(team, eq(team.id, employee.teamId))
    .where(where)
    .orderBy(desc(certification.dateAcquired))
    .limit(MONITORING_EXPORT_ROW_LIMIT + 1);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    dateAcquired: row.dateAcquired,
    credentialUrl: row.credentialUrl,
    fileName: row.fileName,
    fileSize: row.fileSize,
    employeeId: row.employeeId,
    employeeName: formatEmployeeDisplayName(row),
    teamName: row.teamName,
  }));
}

