import "server-only";

import { and, count, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  approvalRequest,
  approvalStep,
  employee,
  employeeRecommendation,
  notificationRead,
  taApplication,
  taCandidate,
  taRequest,
  team,
  user,
} from "@/db/schema";
import { can } from "@/lib/rbac";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { listPendingApprovalsForActor } from "@/server/employee-recommendations/queries";

import type { NotificationItem } from "./types";

/**
 * Sources are plain functions from actor to unread-agnostic items — adding a
 * module's notifications later (per AGENTS.md's note that this starts scoped
 * to User Management only) is adding one more function here, not touching
 * the bell, the read-tracking table, or `countPendingUserApprovals()` below.
 */
type NotificationSource = (actor: CurrentUser) => Promise<Array<Omit<NotificationItem, "read">>>;

/** How long a one-shot "this already happened" event (no lingering pending state to derive from) stays in the bell before aging out on its own. */
const RECENT_EVENT_WINDOW_DAYS = 7;

async function pendingUserSource(actor: CurrentUser): Promise<Array<Omit<NotificationItem, "read">>> {
  // Same permission that gates the Approve/Reject actions themselves — a
  // viewer who can't act on a request has nothing to be notified about.
  if (!can(actor, "users:edit")) return [];

  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.status, "pending"))
    .orderBy(desc(user.createdAt));

  return rows.map((row) => ({
    key: `users:${row.id}`,
    module: "users",
    entityId: row.id,
    title: "New access request",
    description: `${row.name} (${row.email}) is waiting for approval.`,
    href: "/admin/users?status=pending",
    createdAt: row.createdAt,
  }));
}

/**
 * Reuses the "Needs your approval" list's own query for the assigned
 * approver (`listPendingApprovalsForActor()`, which itself hard-`authorize()`s
 * on `employee_recommendations:approve` — a team manager doesn't hold that
 * permission, so a second, parallel query below covers them instead, same
 * "specific approver + team manager" pairing the matching email already uses).
 */
async function pendingRecommendationApprovalSource(actor: CurrentUser): Promise<Array<Omit<NotificationItem, "read">>> {
  const items: Array<Omit<NotificationItem, "read">> = [];

  if (can(actor, "employee_recommendations:approve")) {
    const approverItems = await listPendingApprovalsForActor();
    items.push(
      ...approverItems.map((item) => ({
        key: `employee_recommendations:${item.stepId}`,
        module: "employee_recommendations",
        entityId: item.stepId,
        title: "Recommendation needs your approval",
        description: `${item.employeeName} — submitted by ${item.requestedByLabel}`,
        href: `/employee-recommendations/${item.recommendationId}`,
        createdAt: item.submittedAt,
      })),
    );
  }

  if (actor.roleId === "manager" && actor.teamId) {
    const rows = await db
      .select({
        stepId: approvalStep.id,
        recommendationId: employeeRecommendation.id,
        employeeFirstName: employee.firstName,
        employeeLastName: employee.lastName,
        requestedByLabel: approvalRequest.requestedByLabel,
        updatedAt: employeeRecommendation.updatedAt,
      })
      .from(approvalStep)
      .innerJoin(approvalRequest, eq(approvalRequest.id, approvalStep.approvalRequestId))
      .innerJoin(employeeRecommendation, eq(employeeRecommendation.approvalRequestId, approvalRequest.id))
      .innerJoin(employee, eq(employee.id, employeeRecommendation.employeeId))
      .where(
        and(
          eq(approvalStep.status, "pending"),
          eq(approvalRequest.status, "pending"),
          sql`${approvalStep.stepOrder} = ${approvalRequest.currentStepOrder}`,
          eq(employee.teamId, actor.teamId),
        ),
      );

    items.push(
      ...rows.map((row) => ({
        key: `employee_recommendations:${row.stepId}`,
        module: "employee_recommendations",
        entityId: row.stepId,
        title: "Recommendation needs approval",
        description: `${row.employeeFirstName} ${row.employeeLastName} — submitted by ${row.requestedByLabel} (your team)`,
        href: `/employee-recommendations/${row.recommendationId}`,
        createdAt: row.updatedAt,
      })),
    );
  }

  return items;
}

/** A recommendation approved and waiting on the ERF — `status = "approved"`, `erfGeneratedAt` still null. Visible to the TA Manager role and the employee's team manager, same pairing `notifyErfHandlersOfApproval`'s email uses. */
async function pendingErfSource(actor: CurrentUser): Promise<Array<Omit<NotificationItem, "read">>> {
  const isTaManager = actor.roleId === "talent_acquisition_manager";
  const isTeamManager = actor.roleId === "manager" && Boolean(actor.teamId);
  if (!isTaManager && !isTeamManager) return [];

  const rows = await db
    .select({
      recommendationId: employeeRecommendation.id,
      employeeFirstName: employee.firstName,
      employeeLastName: employee.lastName,
      teamId: employee.teamId,
      updatedAt: employeeRecommendation.updatedAt,
    })
    .from(employeeRecommendation)
    .innerJoin(employee, eq(employee.id, employeeRecommendation.employeeId))
    .where(eq(employeeRecommendation.status, "approved"));

  return rows
    .filter((row) => isTaManager || row.teamId === actor.teamId)
    .map((row) => ({
      key: `employee_recommendations:${row.recommendationId}`,
      module: "employee_recommendations",
      entityId: row.recommendationId,
      title: "Fully approved — ready for ERF",
      description: `${row.employeeFirstName} ${row.employeeLastName}'s recommendation is ready for the ERF to be generated.`,
      href: `/employee-recommendations/${row.recommendationId}`,
      createdAt: row.updatedAt,
    }));
}

/** A recommendation rejected within the last week — no lingering "pending" state, so this ages out on its own rather than needing to be marked resolved anywhere. Same recipients as the matching email: TA Manager + the employee's team manager. */
async function recentRecommendationRejectedSource(actor: CurrentUser): Promise<Array<Omit<NotificationItem, "read">>> {
  const isTaManager = actor.roleId === "talent_acquisition_manager";
  const isTeamManager = actor.roleId === "manager" && Boolean(actor.teamId);
  if (!isTaManager && !isTeamManager) return [];

  const since = new Date(Date.now() - RECENT_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      recommendationId: employeeRecommendation.id,
      employeeFirstName: employee.firstName,
      employeeLastName: employee.lastName,
      teamId: employee.teamId,
      updatedAt: employeeRecommendation.updatedAt,
    })
    .from(employeeRecommendation)
    .innerJoin(employee, eq(employee.id, employeeRecommendation.employeeId))
    .where(and(eq(employeeRecommendation.status, "rejected"), gte(employeeRecommendation.updatedAt, since)));

  return rows
    .filter((row) => isTaManager || row.teamId === actor.teamId)
    .map((row) => ({
      key: `employee_recommendations:${row.recommendationId}-rejected`,
      module: "employee_recommendations",
      entityId: `${row.recommendationId}-rejected`,
      title: "Recommendation rejected",
      description: `The recommendation for ${row.employeeFirstName} ${row.employeeLastName} was rejected.`,
      href: `/employee-recommendations/${row.recommendationId}`,
      createdAt: row.updatedAt,
    }));
}

type TaStageRow = {
  applicationId: string;
  requestId: string;
  candidateFirstName: string;
  candidateLastName: string;
  updatedAt: Date;
};

/** Every active application currently sitting at `stage`, joined through to its request's team. */
async function activeTaApplicationsAtStage(stage: "l2_assessment" | "l3_assessment" | "final_interview"): Promise<
  Array<TaStageRow & { teamId: string | null; unitManagerUserId: string | null }>
> {
  return db
    .select({
      applicationId: taApplication.id,
      requestId: taApplication.requestId,
      candidateFirstName: taCandidate.firstName,
      candidateLastName: taCandidate.lastName,
      updatedAt: taApplication.updatedAt,
      teamId: taRequest.teamId,
      unitManagerUserId: team.unitManagerUserId,
    })
    .from(taApplication)
    .innerJoin(taCandidate, eq(taCandidate.id, taApplication.candidateId))
    .innerJoin(taRequest, eq(taRequest.id, taApplication.requestId))
    .leftJoin(team, eq(team.id, taRequest.teamId))
    .where(and(eq(taApplication.currentStage, stage), eq(taApplication.status, "active")));
}

/** Step 3: L1 passed → notify the requesting team's manager only, matching `notifyL2ReviewersNeeded`'s email. */
async function pendingTaL2Source(actor: CurrentUser): Promise<Array<Omit<NotificationItem, "read">>> {
  if (actor.roleId !== "manager" || !actor.teamId) return [];

  const rows = (await activeTaApplicationsAtStage("l2_assessment")).filter((row) => row.teamId === actor.teamId);

  return rows.map((row) => ({
    key: `talent_acquisition:${row.applicationId}-l2`,
    module: "talent_acquisition",
    entityId: `${row.applicationId}-l2`,
    title: "Ready for L2 Assessment",
    description: `${row.candidateFirstName} ${row.candidateLastName} passed L1 Assessment.`,
    href: `/talent-acquisition/${row.requestId}`,
    createdAt: row.updatedAt,
  }));
}

/** Step 6: L2 (or L2 + Client Interview) passed → TA Manager + the requesting team's manager, matching `notifyL3AssessorsNeeded`'s email. */
async function pendingTaL3Source(actor: CurrentUser): Promise<Array<Omit<NotificationItem, "read">>> {
  const isTaManager = actor.roleId === "talent_acquisition_manager";
  const isTeamManager = actor.roleId === "manager" && Boolean(actor.teamId);
  if (!isTaManager && !isTeamManager) return [];

  const rows = (await activeTaApplicationsAtStage("l3_assessment")).filter(
    (row) => isTaManager || row.teamId === actor.teamId,
  );

  return rows.map((row) => ({
    key: `talent_acquisition:${row.applicationId}-l3`,
    module: "talent_acquisition",
    entityId: `${row.applicationId}-l3`,
    title: "Ready for L3 Interview & Assessment",
    description: `${row.candidateFirstName} ${row.candidateLastName} is ready for L3 Interview & Assessment.`,
    href: `/talent-acquisition/${row.requestId}`,
    createdAt: row.updatedAt,
  }));
}

/** Step 8: L3 passed → the team's Unit Manager + the requesting team's manager, matching `notifyFinalInterviewersNeeded`'s email. */
async function pendingTaFinalSource(actor: CurrentUser): Promise<Array<Omit<NotificationItem, "read">>> {
  const isTeamManager = actor.roleId === "manager" && Boolean(actor.teamId);
  if (!isTeamManager && actor.roleId !== "unit_manager") return [];

  const rows = (await activeTaApplicationsAtStage("final_interview")).filter(
    (row) => (isTeamManager && row.teamId === actor.teamId) || row.unitManagerUserId === actor.id,
  );

  return rows.map((row) => ({
    key: `talent_acquisition:${row.applicationId}-final`,
    module: "talent_acquisition",
    entityId: `${row.applicationId}-final`,
    title: "Ready for Final Interview",
    description: `${row.candidateFirstName} ${row.candidateLastName} is ready for Final Interview.`,
    href: `/talent-acquisition/${row.requestId}`,
    createdAt: row.updatedAt,
  }));
}

/** A candidate migrated to Employee within the last week — no lingering "pending" state, ages out on its own. Same recipients as `notifyMigrationCompleted`'s email: team manager, Unit Manager, Department Head, Admin. */
async function recentTaMigrationSource(actor: CurrentUser): Promise<Array<Omit<NotificationItem, "read">>> {
  const isTeamManager = actor.roleId === "manager" && Boolean(actor.teamId);
  const isAdmin = actor.roleId === "admin";
  if (!isTeamManager && actor.roleId !== "unit_manager" && actor.roleId !== "department_head" && !isAdmin) return [];

  const since = new Date(Date.now() - RECENT_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      applicationId: taApplication.id,
      requestId: taApplication.requestId,
      candidateFirstName: taCandidate.firstName,
      candidateLastName: taCandidate.lastName,
      statusChangedAt: taApplication.statusChangedAt,
      teamId: taRequest.teamId,
      unitManagerUserId: team.unitManagerUserId,
      departmentHeadUserId: team.departmentHeadUserId,
    })
    .from(taApplication)
    .innerJoin(taCandidate, eq(taCandidate.id, taApplication.candidateId))
    .innerJoin(taRequest, eq(taRequest.id, taApplication.requestId))
    .leftJoin(team, eq(team.id, taRequest.teamId))
    .where(and(eq(taApplication.status, "hired"), gte(taApplication.statusChangedAt, since)));

  return rows
    .filter(
      (row) =>
        isAdmin ||
        (isTeamManager && row.teamId === actor.teamId) ||
        row.unitManagerUserId === actor.id ||
        row.departmentHeadUserId === actor.id,
    )
    .map((row) => ({
      key: `talent_acquisition:${row.applicationId}-hired`,
      module: "talent_acquisition",
      entityId: `${row.applicationId}-hired`,
      title: "Migrated to Employee",
      description: `${row.candidateFirstName} ${row.candidateLastName} has been migrated to the Employee module.`,
      href: `/talent-acquisition/${row.requestId}`,
      createdAt: row.statusChangedAt ?? new Date(),
    }));
}

const NOTIFICATION_SOURCES: readonly NotificationSource[] = [
  pendingUserSource,
  pendingRecommendationApprovalSource,
  pendingErfSource,
  recentRecommendationRejectedSource,
  pendingTaL2Source,
  pendingTaL3Source,
  pendingTaFinalSource,
  recentTaMigrationSource,
];

/** The header bell's feed: every open item across every source, marked read/unread for the current viewer. */
export async function listNotifications(): Promise<NotificationItem[]> {
  const actor = await getCurrentUser();
  if (!actor) return [];

  const items = (await Promise.all(NOTIFICATION_SOURCES.map((source) => source(actor)))).flat();
  if (items.length === 0) return [];

  const reads = await db
    .select({ module: notificationRead.module, entityId: notificationRead.entityId })
    .from(notificationRead)
    .where(eq(notificationRead.userId, actor.id));
  const readKeys = new Set(reads.map((row) => `${row.module}:${row.entityId}`));

  return items
    .map((item) => ({ ...item, read: readKeys.has(item.key) }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * The raw pending-approval queue depth, for the "User Management" sidebar
 * badge. Deliberately unaffected by read state — it only changes once a
 * request is actually approved or rejected, unlike the bell's unread count.
 */
export async function countPendingUserApprovals(): Promise<number> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor, "users:edit")) return 0;

  const [{ value }] = await db.select({ value: count() }).from(user).where(eq(user.status, "pending"));
  return value;
}
