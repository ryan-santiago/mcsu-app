import "server-only";

import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  employee,
  oneLotProjectMember,
  oneLotProjectSprint,
  oneLotProjectWorkItem,
  staffAugmentationAssignment,
  staffAugmentationEngagement,
  team,
  user,
} from "@/db/schema";
import { can } from "@/lib/rbac";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { listVisibleOneLotProjects } from "@/server/one-lot-projects/queries";

import type {
  BreakdownRow,
  EngagementDashboardData,
  OneLotProjectRollupRow,
  OneLotProjectsDashboardData,
  StaffAugmentationDashboardData,
} from "./types";

/** Same ordering `getOneLotProjectPriorityBreakdown`/`getOneLotProjectTypesOfWork` use per-project — kept as a local copy since those aren't exported. */
const PRIORITY_ORDER = [
  { value: "highest", label: "Highest" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "lowest", label: "Lowest" },
] as const;

const TYPE_ORDER = [
  { value: "task", label: "Task" },
  { value: "bug", label: "Bug" },
  { value: "subtask", label: "Subtask" },
] as const;

/**
 * Visibility is pure RBAC here — unlike One-Lot Projects below, Staff
 * Augmentation has no membership escape hatch (see the doc comment on
 * `staffAugmentationEngagement` in schema.ts).
 */
async function getStaffAugmentationDashboardData(
  actor: CurrentUser,
  range: { from: Date; to: Date },
): Promise<StaffAugmentationDashboardData | null> {
  if (!can(actor, "staff_augmentation:read")) return null;

  const [{ totalEngagements }] = await db
    .select({ totalEngagements: sql<number>`count(*)::int` })
    .from(staffAugmentationEngagement);

  const [{ staffedHeadcount }] = await db
    .select({ staffedHeadcount: sql<number>`count(distinct ${staffAugmentationAssignment.employeeId})::int` })
    .from(staffAugmentationAssignment)
    .innerJoin(employee, eq(employee.id, staffAugmentationAssignment.employeeId))
    .where(eq(employee.isResigned, false));

  const [{ newAssignments }] = await db
    .select({ newAssignments: sql<number>`count(*)::int` })
    .from(staffAugmentationAssignment)
    .where(and(gte(staffAugmentationAssignment.createdAt, range.from), lte(staffAugmentationAssignment.createdAt, range.to)));

  // Level/Position would be the obvious first breakdown here, but almost no
  // staffed employee has an `employeeEmployment` row yet in practice (the
  // same data-entry gap Workforce Dashboard surfaced) — it would render
  // empty for real data today. Team assignment lives directly on `employee`
  // and has full coverage, so it's the one that's actually useful right now.
  const teamRows = await db
    .select({ label: team.name, value: sql<number>`count(distinct ${staffAugmentationAssignment.employeeId})::int` })
    .from(staffAugmentationAssignment)
    .innerJoin(employee, eq(employee.id, staffAugmentationAssignment.employeeId))
    .innerJoin(team, eq(team.id, employee.teamId))
    .where(eq(employee.isResigned, false))
    .groupBy(team.name)
    .orderBy(team.name);

  const engagementRows = await db
    .select({ label: staffAugmentationEngagement.name, value: sql<number>`count(*)::int` })
    .from(staffAugmentationAssignment)
    .innerJoin(staffAugmentationEngagement, eq(staffAugmentationEngagement.id, staffAugmentationAssignment.engagementId))
    .innerJoin(employee, eq(employee.id, staffAugmentationAssignment.employeeId))
    .where(eq(employee.isResigned, false))
    .groupBy(staffAugmentationEngagement.name);

  return {
    totalEngagements,
    staffedHeadcount,
    newAssignments,
    teamBreakdown: teamRows.map((r): BreakdownRow => ({ label: r.label, count: r.value })),
    engagementBreakdown: engagementRows
      .map((r): BreakdownRow => ({ label: r.label, count: r.value }))
      .sort((a, b) => b.count - a.count),
  };
}

const EMPTY_ONE_LOT_DATA: OneLotProjectsDashboardData = {
  totalProjects: 0,
  activeSprints: 0,
  workItems: 0,
  pointsDelivered: 0,
  projects: [],
  priorityBreakdown: PRIORITY_ORDER.map((o) => ({ label: o.label, count: 0 })),
  typesOfWorkBreakdown: TYPE_ORDER.map((o) => ({ label: o.label, count: 0 })),
  teamWorkload: [],
};

/**
 * Visible projects are whatever `listVisibleOneLotProjects` returns — every
 * project for a `one_lot_projects:read` holder, just the actor's own
 * memberships otherwise (see that function's doc comment). A member-only
 * actor still gets a real (if smaller) rollup rather than an empty section,
 * same as the module's own list page and nav entry.
 */
async function getOneLotProjectsDashboardData(
  actor: CurrentUser,
  range: { from: Date; to: Date },
): Promise<OneLotProjectsDashboardData | null> {
  const visibleProjects = await listVisibleOneLotProjects(actor);
  const hasModulePermission = can(actor, "one_lot_projects:read");
  if (!hasModulePermission && visibleProjects.length === 0) return null;
  if (visibleProjects.length === 0) return EMPTY_ONE_LOT_DATA;

  const projectIds = visibleProjects.map((p) => p.id);

  const [sprintCounts, itemCounts, memberCounts, priorityRows, typeRows, workloadRows, pointsDeliveredRow] =
    await Promise.all([
      db
        .select({
          projectId: oneLotProjectSprint.projectId,
          active: sql<number>`count(*) filter (where status = 'active')::int`,
          planned: sql<number>`count(*) filter (where status = 'planned')::int`,
          completed: sql<number>`count(*) filter (where status = 'completed')::int`,
        })
        .from(oneLotProjectSprint)
        .where(inArray(oneLotProjectSprint.projectId, projectIds))
        .groupBy(oneLotProjectSprint.projectId),
      db
        .select({
          projectId: oneLotProjectWorkItem.projectId,
          count: sql<number>`count(*)::int`,
          points: sql<string>`coalesce(sum(${oneLotProjectWorkItem.storyPoints}), 0)`,
        })
        .from(oneLotProjectWorkItem)
        .where(and(inArray(oneLotProjectWorkItem.projectId, projectIds), isNull(oneLotProjectWorkItem.parentId)))
        .groupBy(oneLotProjectWorkItem.projectId),
      db
        .select({ projectId: oneLotProjectMember.projectId, count: sql<number>`count(*)::int` })
        .from(oneLotProjectMember)
        .where(inArray(oneLotProjectMember.projectId, projectIds))
        .groupBy(oneLotProjectMember.projectId),
      db
        .select({ value: oneLotProjectWorkItem.priority, count: sql<number>`count(*)::int` })
        .from(oneLotProjectWorkItem)
        .where(and(inArray(oneLotProjectWorkItem.projectId, projectIds), isNull(oneLotProjectWorkItem.parentId)))
        .groupBy(oneLotProjectWorkItem.priority),
      db
        .select({ value: oneLotProjectWorkItem.type, count: sql<number>`count(*)::int` })
        .from(oneLotProjectWorkItem)
        .where(inArray(oneLotProjectWorkItem.projectId, projectIds))
        .groupBy(oneLotProjectWorkItem.type),
      db
        .select({ assigneeId: oneLotProjectWorkItem.assigneeId, name: user.name, count: sql<number>`count(*)::int` })
        .from(oneLotProjectWorkItem)
        .leftJoin(user, eq(user.id, oneLotProjectWorkItem.assigneeId))
        .where(and(inArray(oneLotProjectWorkItem.projectId, projectIds), isNull(oneLotProjectWorkItem.parentId)))
        .groupBy(oneLotProjectWorkItem.assigneeId, user.name),
      db
        .select({
          pointsDelivered: sql<string>`coalesce(sum(${oneLotProjectWorkItem.storyPoints}) filter (where ${oneLotProjectWorkItem.parentId} is null), 0)`,
        })
        .from(oneLotProjectWorkItem)
        .innerJoin(oneLotProjectSprint, eq(oneLotProjectSprint.id, oneLotProjectWorkItem.sprintId))
        .where(
          and(
            inArray(oneLotProjectWorkItem.projectId, projectIds),
            eq(oneLotProjectSprint.status, "completed"),
            gte(oneLotProjectSprint.completedAt, range.from),
            lte(oneLotProjectSprint.completedAt, range.to),
          ),
        ),
    ]);

  const sprintMap = new Map(sprintCounts.map((r) => [r.projectId, r]));
  const itemMap = new Map(itemCounts.map((r) => [r.projectId, r]));
  const memberMap = new Map(memberCounts.map((r) => [r.projectId, r.count]));

  const projects: OneLotProjectRollupRow[] = visibleProjects
    .map((p) => {
      const s = sprintMap.get(p.id);
      const i = itemMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        activeSprints: s?.active ?? 0,
        plannedSprints: s?.planned ?? 0,
        completedSprints: s?.completed ?? 0,
        workItemCount: i?.count ?? 0,
        storyPoints: Number(i?.points ?? 0),
        memberCount: memberMap.get(p.id) ?? 0,
      };
    })
    .sort((a, b) => b.workItemCount - a.workItemCount);

  const priorityCounts = new Map(priorityRows.map((r) => [r.value, r.count]));
  const typeCounts = new Map(typeRows.map((r) => [r.value, r.count]));

  const teamWorkload = workloadRows
    .map((r): BreakdownRow => ({ label: r.assigneeId ? (r.name ?? "") : "Unassigned", count: r.count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalProjects: projects.length,
    activeSprints: projects.reduce((sum, p) => sum + p.activeSprints, 0),
    workItems: projects.reduce((sum, p) => sum + p.workItemCount, 0),
    pointsDelivered: Number(pointsDeliveredRow[0]?.pointsDelivered ?? 0),
    projects,
    priorityBreakdown: PRIORITY_ORDER.map((o) => ({ label: o.label, count: priorityCounts.get(o.value) ?? 0 })),
    typesOfWorkBreakdown: TYPE_ORDER.map((o) => ({ label: o.label, count: typeCounts.get(o.value) ?? 0 })),
    teamWorkload,
  };
}

export async function getEngagementDashboardData(range: { from: Date; to: Date }): Promise<EngagementDashboardData> {
  const actor = await getCurrentUser();
  if (!actor) return { staffAugmentation: null, oneLotProjects: null };

  const [staffAugmentation, oneLotProjects] = await Promise.all([
    getStaffAugmentationDashboardData(actor, range),
    getOneLotProjectsDashboardData(actor, range),
  ]);

  return { staffAugmentation, oneLotProjects };
}
