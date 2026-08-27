import "server-only";

import { differenceInCalendarDays, startOfToday } from "date-fns";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { approvalRequest, approvalStep, employee, employeeRecommendation, role, user } from "@/db/schema";
import { can, hasUnrestrictedAccess } from "@/lib/rbac";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { authorize, getCurrentUser } from "@/lib/session";
import { latestEmploymentSubquery, loadEmployeeDetail } from "@/server/employees/queries";

import { resolveRecommendationBadge } from "./badge";
import type {
  ApprovalStepView,
  EmployeeRecommendationSnapshot,
  PendingApprovalItem,
  RecommendationApproval,
  RecommendationDetail,
  RecommendationEmployeeOption,
  RecommendationListItem,
  RecommendationQueueItem,
} from "./types";

/** Statuses shown in the "In progress" list — a completed lifecycle (applied) or a dead end (rejected/cancelled) drops off. */
const IN_PROGRESS_STATUSES = ["draft", "submitted", "approved", "erf_generated"] as const;

/** An `employeeRecommendation` in any of these statuses already "claims" its `sourceEmploymentId` — excluded from the queue so it isn't double-flagged. Rejected/cancelled rows fall back into the queue, since those need someone to act again. */
const OPEN_RECOMMENDATION_STATUSES = ["draft", "submitted", "approved", "erf_generated"] as const;

const MONITORED_EMPLOYMENT_TYPES = ["project_based", "probationary"] as const;

function triggerTypeFor(employmentTypeId: string): "ph_contract_expiring" | "probationary_expiring" {
  return employmentTypeId === "project_based" ? "ph_contract_expiring" : "probationary_expiring";
}

/**
 * Employees whose latest employment is Project Hired ("project_based") or
 * Probationary and within (or past) the renewal/review window — see
 * docs/EMPLOYEE_RECOMMENDATION.md §6. Computed on read, same "never stored,
 * never goes stale" convention as the notification bell's sources
 * (`src/server/notifications/queries.ts`) — a renewed contract just stops
 * producing a row rather than needing anything cleaned up.
 */
export async function listRecommendationQueue(): Promise<RecommendationQueueItem[]> {
  const actor = await authorize("employee_recommendations:read");

  // Non-admins with no resolved team see nothing rather than everyone —
  // same convention as `listEmployees()`.
  if (!hasUnrestrictedAccess(actor) && !actor.teamId) return [];

  const latestEmployment = latestEmploymentSubquery();

  const rows = await db
    .select({
      employeeId: employee.id,
      employmentId: latestEmployment.id,
      code: employee.code,
      firstName: employee.firstName,
      lastName: employee.lastName,
      employmentTypeId: latestEmployment.employmentTypeId,
      employmentTypeName: latestEmployment.employmentTypeName,
      endDate: latestEmployment.endDate,
      openRecommendationId: employeeRecommendation.id,
    })
    .from(employee)
    .innerJoin(latestEmployment, eq(latestEmployment.employeeId, employee.id))
    .leftJoin(
      employeeRecommendation,
      and(
        eq(employeeRecommendation.sourceEmploymentId, latestEmployment.id),
        inArray(employeeRecommendation.status, OPEN_RECOMMENDATION_STATUSES),
      ),
    )
    .where(
      and(
        eq(employee.isResigned, false),
        inArray(latestEmployment.employmentTypeId, MONITORED_EMPLOYMENT_TYPES),
        sql`${latestEmployment.endDate} is not null`,
        hasUnrestrictedAccess(actor) || !actor.teamId ? undefined : eq(employee.teamId, actor.teamId),
      ),
    );

  const today = startOfToday();

  const items: RecommendationQueueItem[] = [];
  for (const row of rows) {
    if (row.openRecommendationId) continue;
    if (!row.endDate) continue;

    const triggerType = triggerTypeFor(row.employmentTypeId);
    const daysRemaining = differenceInCalendarDays(new Date(`${row.endDate}T00:00:00`), today);
    const badge = resolveRecommendationBadge(triggerType, daysRemaining);
    if (!badge) continue;

    items.push({
      employeeId: row.employeeId,
      employmentId: row.employmentId,
      employeeCode: row.code,
      employeeName: formatEmployeeDisplayName(row),
      triggerType,
      employmentTypeName: row.employmentTypeName,
      endDate: row.endDate,
      daysRemaining,
      badge,
    });
  }

  return items.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/** The roster an actor may start a manual (`manual_regular`) recommendation for — their own team, active employees only. */
export async function listRecommendationEligibleEmployees(): Promise<RecommendationEmployeeOption[]> {
  const actor = await authorize("employee_recommendations:edit");

  if (!hasUnrestrictedAccess(actor) && !actor.teamId) return [];

  const latestEmployment = latestEmploymentSubquery();

  const rows = await db
    .select({
      id: employee.id,
      code: employee.code,
      firstName: employee.firstName,
      lastName: employee.lastName,
      levelName: latestEmployment.levelName,
      positionName: latestEmployment.positionName,
    })
    .from(employee)
    .leftJoin(latestEmployment, eq(latestEmployment.employeeId, employee.id))
    .where(
      and(
        eq(employee.isResigned, false),
        hasUnrestrictedAccess(actor) || !actor.teamId ? undefined : eq(employee.teamId, actor.teamId),
      ),
    );

  return rows
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: formatEmployeeDisplayName(row),
      levelPositionLabel: row.levelName && row.positionName ? `${row.levelName} - ${row.positionName}` : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The employee's current data, read live — populates the form's "FROM"
 * fields and the General Information snapshot at creation time. See
 * docs/EMPLOYEE_RECOMMENDATION.md §5.
 */
export async function getEmployeeRecommendationSnapshot(employeeId: string): Promise<EmployeeRecommendationSnapshot | null> {
  const actor = await authorize("employee_recommendations:edit");

  const detail = await loadEmployeeDetail(employeeId);
  if (!detail) return null;
  if (!hasUnrestrictedAccess(actor) && detail.teamId !== actor.teamId) return null;

  const latest = detail.employments[0] ?? null;

  return {
    employeeId: detail.id,
    employeeName: formatEmployeeDisplayName(detail),
    employeeCode: detail.code,
    teamId: detail.teamId,
    teamName: detail.teamName,
    levelId: latest?.levelId ?? null,
    levelName: latest?.levelName ?? null,
    positionId: latest?.positionId ?? null,
    positionName: latest?.positionName ?? null,
    levelPositionLabel: latest ? `${latest.levelName} - ${latest.positionName}` : null,
    employmentTypeId: latest?.employmentTypeId ?? null,
    employmentTypeName: latest?.employmentTypeName ?? null,
    salary: latest?.salary ?? null,
    communicationAllowance: latest?.communicationAllowance ?? null,
    transportationAllowance: latest?.transportationAllowance ?? null,
  };
}

/** The approval timeline for one recommendation, joined with role labels and approver/decider names. */
async function loadApproval(approvalRequestId: string): Promise<RecommendationApproval | null> {
  const [request] = await db
    .select({ id: approvalRequest.id, status: approvalRequest.status, currentStepOrder: approvalRequest.currentStepOrder })
    .from(approvalRequest)
    .where(eq(approvalRequest.id, approvalRequestId))
    .limit(1);
  if (!request) return null;

  const decidedByUser = alias(user, "decided_by_user");
  const approverUser = alias(user, "approver_user");

  const stepRows = await db
    .select({
      id: approvalStep.id,
      stepOrder: approvalStep.stepOrder,
      roleLabel: role.label,
      approverName: approverUser.name,
      status: approvalStep.status,
      decidedByName: decidedByUser.name,
      decidedAt: approvalStep.decidedAt,
      note: approvalStep.note,
    })
    .from(approvalStep)
    .innerJoin(role, eq(role.id, approvalStep.requiredRoleId))
    .innerJoin(approverUser, eq(approverUser.id, approvalStep.approverUserId))
    .leftJoin(decidedByUser, eq(decidedByUser.id, approvalStep.decidedBy))
    .where(eq(approvalStep.approvalRequestId, approvalRequestId))
    .orderBy(asc(approvalStep.stepOrder));

  const steps: ApprovalStepView[] = stepRows.map((step) => ({
    id: step.id,
    stepOrder: step.stepOrder,
    roleLabel: step.roleLabel,
    approverName: step.approverName,
    status: step.status,
    decidedByName: step.decidedByName,
    decidedAt: step.decidedAt,
    note: step.note,
  }));

  return { approvalRequestId: request.id, status: request.status, currentStepOrder: request.currentStepOrder, steps };
}

export async function getRecommendationById(id: string): Promise<RecommendationDetail | null> {
  const actor = await authorize("employee_recommendations:read");

  const [row] = await db
    .select({
      id: employeeRecommendation.id,
      employeeId: employeeRecommendation.employeeId,
      employeeFirstName: employee.firstName,
      employeeLastName: employee.lastName,
      employeeTeamId: employee.teamId,
      triggerType: employeeRecommendation.triggerType,
      status: employeeRecommendation.status,
      submittedByName: employeeRecommendation.submittedByName,
      employeeNumberSnapshot: employeeRecommendation.employeeNumberSnapshot,
      departmentSnapshot: employeeRecommendation.departmentSnapshot,
      positionSnapshot: employeeRecommendation.positionSnapshot,
      managerNameSnapshot: employeeRecommendation.managerNameSnapshot,
      requestedActions: employeeRecommendation.requestedActions,
      accomplishmentsAndRecommendation: employeeRecommendation.accomplishmentsAndRecommendation,
      kpiResultStorageKey: employeeRecommendation.kpiResultStorageKey,
      erfStorageKey: employeeRecommendation.erfStorageKey,
      erfGeneratedAt: employeeRecommendation.erfGeneratedAt,
      appliedToEmploymentHistoryAt: employeeRecommendation.appliedToEmploymentHistoryAt,
      approvalRequestId: employeeRecommendation.approvalRequestId,
      createdAt: employeeRecommendation.createdAt,
      updatedAt: employeeRecommendation.updatedAt,
    })
    .from(employeeRecommendation)
    .innerJoin(employee, eq(employee.id, employeeRecommendation.employeeId))
    .where(eq(employeeRecommendation.id, id))
    .limit(1);

  if (!row) return null;

  const inScope = hasUnrestrictedAccess(actor) || row.employeeTeamId === actor.teamId;
  const isAssignedApprover = row.approvalRequestId ? await isAnyStepApprover(row.approvalRequestId, actor.id) : false;
  // The Talent Acquisition Manager who generates the ERF / applies the
  // result isn't scoped to any one team by design — same reason the
  // Unit Manager/Department Head visibility gap (round 3) needed fixing.
  // Excludes `draft`: that's still a manager's private working copy.
  const canActAsErfHandler = can(actor, "employee_recommendations:generate_erf") && row.status !== "draft";
  if (!inScope && !isAssignedApprover && !canActAsErfHandler) return null;

  const approval = row.approvalRequestId ? await loadApproval(row.approvalRequestId) : null;

  const currentStep = approval?.steps.find((step) => step.stepOrder === approval.currentStepOrder) ?? null;
  const actionableStepId =
    currentStep && currentStep.status === "pending" && approval?.status === "pending" && can(actor, "employee_recommendations:approve")
      ? await isActorTheApprover(actor, id, currentStep.id)
      : null;

  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: formatEmployeeDisplayName({ firstName: row.employeeFirstName, lastName: row.employeeLastName }),
    triggerType: row.triggerType,
    status: row.status,
    submittedByName: row.submittedByName,
    employeeNumberSnapshot: row.employeeNumberSnapshot,
    departmentSnapshot: row.departmentSnapshot,
    positionSnapshot: row.positionSnapshot,
    managerNameSnapshot: row.managerNameSnapshot,
    // Stored as plain `jsonb` (no Zod-narrowed column type) — trusted here since only this module's own actions ever write it, always through `requestedActionsSchema`.
    requestedActions: row.requestedActions as RecommendationDetail["requestedActions"],
    accomplishmentsAndRecommendation: row.accomplishmentsAndRecommendation,
    hasKpiResult: row.kpiResultStorageKey !== null,
    hasErf: row.erfStorageKey !== null,
    erfGeneratedAt: row.erfGeneratedAt,
    appliedToEmploymentHistoryAt: row.appliedToEmploymentHistoryAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canEdit: inScope && row.status === "draft" && can(actor, "employee_recommendations:edit"),
    canSubmit: inScope && row.status === "draft" && can(actor, "employee_recommendations:edit"),
    canCancel: inScope && (row.status === "draft" || row.status === "submitted") && can(actor, "employee_recommendations:edit"),
    canGenerateErf: canActAsErfHandler && row.status === "approved",
    canApply: canActAsErfHandler && row.status === "erf_generated",
    approval,
    actionableStepId,
  };
}

/**
 * Whether the actor is assigned *any* step (past, current, or upcoming) on
 * this approval request — not just the currently-actionable one. A Unit
 * Manager/Department Head is very often not on the recommended employee's
 * own team (that's the whole point of the role), so team-scoped visibility
 * in `getRecommendationById` alone would 404 the very people the "Needs
 * your approval" notification just sent here. See
 * docs/EMPLOYEE_RECOMMENDATION.md §9.
 */
async function isAnyStepApprover(approvalRequestId: string, actorId: string): Promise<boolean> {
  const [step] = await db
    .select({ id: approvalStep.id })
    .from(approvalStep)
    .where(and(eq(approvalStep.approvalRequestId, approvalRequestId), eq(approvalStep.approverUserId, actorId)))
    .limit(1);
  return Boolean(step);
}

/** `hasUnrestrictedAccess` bypasses the identity check the same way it bypasses team scoping elsewhere — an admin can always resolve a step. */
async function isActorTheApprover(
  actor: { id: string; roleId: string },
  recommendationId: string,
  stepId: string,
): Promise<string | null> {
  if (hasUnrestrictedAccess(actor)) return stepId;

  const [step] = await db
    .select({ approverUserId: approvalStep.approverUserId })
    .from(approvalStep)
    .where(eq(approvalStep.id, stepId))
    .limit(1);

  return step && step.approverUserId === actor.id ? stepId : null;
}

/** Pending approval steps assigned to the current actor — the "Needs your approval" list. */
export async function listPendingApprovalsForActor(): Promise<PendingApprovalItem[]> {
  const actor = await authorize("employee_recommendations:approve");

  const rows = await db
    .select({
      approvalRequestId: approvalRequest.id,
      stepId: approvalStep.id,
      recommendationId: employeeRecommendation.id,
      employeeFirstName: employee.firstName,
      employeeLastName: employee.lastName,
      employeeCode: employee.code,
      roleLabel: role.label,
      requestedByLabel: approvalRequest.requestedByLabel,
      submittedAt: employeeRecommendation.updatedAt,
    })
    .from(approvalStep)
    .innerJoin(approvalRequest, eq(approvalRequest.id, approvalStep.approvalRequestId))
    .innerJoin(role, eq(role.id, approvalStep.requiredRoleId))
    .innerJoin(employeeRecommendation, eq(employeeRecommendation.approvalRequestId, approvalRequest.id))
    .innerJoin(employee, eq(employee.id, employeeRecommendation.employeeId))
    .where(
      and(
        eq(approvalStep.approverUserId, actor.id),
        eq(approvalStep.status, "pending"),
        eq(approvalRequest.status, "pending"),
        sql`${approvalStep.stepOrder} = ${approvalRequest.currentStepOrder}`,
      ),
    )
    .orderBy(asc(employeeRecommendation.updatedAt));

  return rows.map((row) => ({
    approvalRequestId: row.approvalRequestId,
    stepId: row.stepId,
    recommendationId: row.recommendationId,
    employeeName: formatEmployeeDisplayName({ firstName: row.employeeFirstName, lastName: row.employeeLastName }),
    employeeCode: row.employeeCode,
    roleLabel: row.roleLabel,
    requestedByLabel: row.requestedByLabel,
    submittedAt: row.submittedAt,
  }));
}

/**
 * Count-only version of `listPendingApprovalsForActor()`, for the sidebar
 * nav badge (`app/(app)/layout.tsx`) — called unconditionally for every
 * signed-in user on every page load, so it uses `getCurrentUser()` +
 * `can()` and returns 0 rather than `authorize()`'s throw, same as
 * `countPendingUserApprovals()`.
 */
export async function countPendingApprovalsForActor(): Promise<number> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor, "employee_recommendations:approve")) return 0;

  const [row] = await db
    .select({ value: count() })
    .from(approvalStep)
    .innerJoin(approvalRequest, eq(approvalRequest.id, approvalStep.approvalRequestId))
    .where(
      and(
        eq(approvalStep.approverUserId, actor.id),
        eq(approvalStep.status, "pending"),
        eq(approvalRequest.status, "pending"),
        sql`${approvalStep.stepOrder} = ${approvalRequest.currentStepOrder}`,
      ),
    );

  return row.value;
}

/** Real `employeeRecommendation` rows still in play — draft through erf_generated — for the "In progress" list. */
export async function listRecommendations(): Promise<RecommendationListItem[]> {
  const actor = await authorize("employee_recommendations:read");

  if (!hasUnrestrictedAccess(actor) && !actor.teamId) return [];

  const rows = await db
    .select({
      id: employeeRecommendation.id,
      employeeId: employeeRecommendation.employeeId,
      code: employee.code,
      firstName: employee.firstName,
      lastName: employee.lastName,
      triggerType: employeeRecommendation.triggerType,
      status: employeeRecommendation.status,
      updatedAt: employeeRecommendation.updatedAt,
    })
    .from(employeeRecommendation)
    .innerJoin(employee, eq(employee.id, employeeRecommendation.employeeId))
    .where(
      and(
        inArray(employeeRecommendation.status, IN_PROGRESS_STATUSES),
        hasUnrestrictedAccess(actor) || !actor.teamId ? undefined : eq(employee.teamId, actor.teamId),
      ),
    )
    .orderBy(desc(employeeRecommendation.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    employeeCode: row.code,
    employeeName: formatEmployeeDisplayName(row),
    triggerType: row.triggerType,
    status: row.status,
    updatedAt: row.updatedAt,
  }));
}
