import "server-only";

import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { employee, employeeChangeRequest, role, user, type AuditChange, type ChangeRequestStatus } from "@/db/schema";
import { formatEmployeeName } from "@/lib/employee-format";
import { hasUnrestrictedAccess } from "@/lib/rbac";
import { authorize } from "@/lib/session";

import type { ChangeRequestCounts, ChangeRequestFilters, ChangeRequestListResult, ChangeRequestRow } from "./types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const STATUSES: ChangeRequestStatus[] = ["pending", "approved", "rejected"];

const reviewer = alias(user, "reviewer");

function buildWhere(
  filters: ChangeRequestFilters,
  /** Non-null when the caller isn't `hasUnrestrictedAccess()` — narrows to requests about their own team. */
  scopeTeamId: string | null,
): SQL | undefined {
  const clauses: SQL[] = [];

  if (scopeTeamId) {
    clauses.push(eq(employee.teamId, scopeTeamId));
  }

  if (filters.status && filters.status !== "all") {
    clauses.push(eq(employeeChangeRequest.status, filters.status));
  }

  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

function selection() {
  return {
    id: employeeChangeRequest.id,
    employeeId: employeeChangeRequest.employeeId,
    employeeFirstName: employee.firstName,
    employeeMiddleName: employee.middleName,
    employeeLastName: employee.lastName,
    employeeCode: employee.code,
    requesterId: user.id,
    requesterName: user.name,
    requesterEmail: user.email,
    requesterRank: role.rank,
    requesterRoleLabel: role.label,
    status: employeeChangeRequest.status,
    changes: employeeChangeRequest.changes,
    createdAt: employeeChangeRequest.createdAt,
    reviewedByName: reviewer.name,
    reviewedAt: employeeChangeRequest.reviewedAt,
    reviewNote: employeeChangeRequest.reviewNote,
  };
}

function toRow(row: {
  id: string;
  employeeId: string;
  employeeFirstName: string;
  employeeMiddleName: string | null;
  employeeLastName: string;
  employeeCode: string | null;
  requesterId: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterRank: number | null;
  requesterRoleLabel: string | null;
  status: ChangeRequestStatus;
  changes: AuditChange[] | null;
  createdAt: Date;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
}): ChangeRequestRow {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: formatEmployeeName({
      firstName: row.employeeFirstName,
      middleName: row.employeeMiddleName,
      lastName: row.employeeLastName,
    }),
    employeeCode: row.employeeCode,
    requesterId: row.requesterId,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    requesterRank: row.requesterRank,
    requesterRoleLabel: row.requesterRoleLabel,
    status: row.status,
    changes: row.changes ?? [],
    createdAt: row.createdAt,
    reviewedByName: row.reviewedByName,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
  };
}

/**
 * Lists self-service employee-profile change requests for the Approvals
 * queue, plus per-status totals for the filter tabs (same shape as
 * `listUsers`'s `counts` in `src/server/users/queries.ts`).
 */
export async function listChangeRequests(filters: ChangeRequestFilters = {}): Promise<ChangeRequestListResult> {
  const actor = await authorize("employees:edit");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  // Non-admins with no resolved team see nothing rather than everyone's requests.
  if (!hasUnrestrictedAccess(actor) && !actor.teamId) {
    return { requests: [], counts: { pending: 0, approved: 0, rejected: 0 }, total: 0, page, pageSize };
  }

  const scopeTeamId = hasUnrestrictedAccess(actor) ? null : actor.teamId;
  const where = buildWhere(filters, scopeTeamId);

  const rows = await db
    .select(selection())
    .from(employeeChangeRequest)
    .innerJoin(employee, eq(employee.id, employeeChangeRequest.employeeId))
    .leftJoin(user, eq(user.id, employeeChangeRequest.requestedBy))
    .leftJoin(role, eq(role.id, user.roleId))
    .leftJoin(reviewer, eq(reviewer.id, employeeChangeRequest.reviewedBy))
    .where(where)
    .orderBy(desc(employeeChangeRequest.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(employeeChangeRequest)
    .innerJoin(employee, eq(employee.id, employeeChangeRequest.employeeId))
    .where(where);

  const grouped = await db
    .select({ status: employeeChangeRequest.status, total: count() })
    .from(employeeChangeRequest)
    .innerJoin(employee, eq(employee.id, employeeChangeRequest.employeeId))
    .where(scopeTeamId ? eq(employee.teamId, scopeTeamId) : undefined)
    .groupBy(employeeChangeRequest.status);

  const counts: ChangeRequestCounts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of grouped) counts[row.status] = row.total;
  for (const status of STATUSES) counts[status] ??= 0;

  return { requests: rows.map(toRow), counts, total, page, pageSize };
}

/**
 * Loads a single request with the requester's rank/roleLabel, for the
 * approve/reject actions' rank check (`denyReasonForActingOn` in
 * `src/lib/rbac.ts`) and their own audit-diff framing.
 */
export async function getChangeRequestById(id: string) {
  const [row] = await db
    .select({
      id: employeeChangeRequest.id,
      employeeId: employeeChangeRequest.employeeId,
      status: employeeChangeRequest.status,
      proposedProfile: employeeChangeRequest.proposedProfile,
      proposedCurrentAddress: employeeChangeRequest.proposedCurrentAddress,
      proposedPermanentAddress: employeeChangeRequest.proposedPermanentAddress,
      changes: employeeChangeRequest.changes,
      requesterId: user.id,
      requesterName: user.name,
      requesterRank: role.rank,
      requesterRoleLabel: role.label,
      employeeFirstName: employee.firstName,
      employeeMiddleName: employee.middleName,
      employeeLastName: employee.lastName,
      employeeTeamId: employee.teamId,
    })
    .from(employeeChangeRequest)
    .innerJoin(employee, eq(employee.id, employeeChangeRequest.employeeId))
    .leftJoin(user, eq(user.id, employeeChangeRequest.requestedBy))
    .leftJoin(role, eq(role.id, user.roleId))
    .where(eq(employeeChangeRequest.id, id))
    .limit(1);

  return row ?? null;
}
