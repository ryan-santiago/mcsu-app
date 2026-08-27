import "server-only";

import { alias } from "drizzle-orm/pg-core";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  client,
  employmentType,
  engagementType,
  gender,
  jobPostingSource,
  level,
  position,
  role as roleTable,
  salesRepresentative,
  solutionsManager,
  team,
  user,
} from "@/db/schema";
import { can, type Permission } from "@/lib/rbac";
import { authorize } from "@/lib/session";

import type { LookupKind, LookupOption, LookupRow, TeamApproverRow } from "./types";

/** Each kind maps to a physically separate table — see `db/schema.ts`'s `lookupColumns()`. */
function tableFor(kind: LookupKind) {
  switch (kind) {
    case "client":
      return client;
    case "position":
      return position;
    case "level":
      return level;
    case "gender":
      return gender;
    case "team":
      return team;
    case "sales_representative":
      return salesRepresentative;
    case "solutions_manager":
      return solutionsManager;
    case "engagement_type":
      return engagementType;
    case "employment_type":
      return employmentType;
    case "job_posting_source":
      return jobPostingSource;
  }
}

/** Full rows (active and inactive) for the Maintenance admin screen. */
export async function listLookup(kind: LookupKind): Promise<LookupRow[]> {
  await authorize("maintenance:read");
  const table = tableFor(kind);
  return db.select().from(table).orderBy(asc(table.name));
}

/**
 * Active-only id/name pairs for pickers elsewhere (the Employee form's
 * Gender/Team/Level/Position/Client selects). Deliberately **not**
 * authorization-gated here — callers authorize for their own permission
 * (`employees:read`, not `maintenance:read`) before calling this, since a
 * Manager without Maintenance access still needs to pick from these lists.
 */
export async function listLookupOptions(kind: LookupKind): Promise<LookupOption[]> {
  const table = tableFor(kind);
  return db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(eq(table.isActive, true))
    .orderBy(asc(table.name));
}

/**
 * Every active team with its resolved Unit Manager / Department Head — the
 * approvers Employee Recommendation's approval chain resolves against (see
 * `docs/EMPLOYEE_RECOMMENDATION.md` §4.1/§5.2). Rendered as an extra panel
 * on Maintenance's Teams tab rather than folded into the generic
 * `LookupTable`, since no other lookup kind has this shape.
 */
export async function listTeamApprovers(): Promise<TeamApproverRow[]> {
  await authorize("maintenance:read");

  const unitManager = alias(user, "unit_manager");
  const departmentHead = alias(user, "department_head");

  const rows = await db
    .select({
      teamId: team.id,
      teamName: team.name,
      unitManagerId: team.unitManagerUserId,
      unitManagerName: unitManager.name,
      departmentHeadId: team.departmentHeadUserId,
      departmentHeadName: departmentHead.name,
    })
    .from(team)
    .leftJoin(unitManager, eq(unitManager.id, team.unitManagerUserId))
    .leftJoin(departmentHead, eq(departmentHead.id, team.departmentHeadUserId))
    .where(eq(team.isActive, true))
    .orderBy(asc(team.name));

  return rows.map((row) => ({
    teamId: row.teamId,
    teamName: row.teamName,
    unitManager: row.unitManagerId && row.unitManagerName ? { id: row.unitManagerId, name: row.unitManagerName } : null,
    departmentHead: row.departmentHeadId && row.departmentHeadName ? { id: row.departmentHeadId, name: row.departmentHeadName } : null,
  }));
}

/**
 * User accounts that can actually act as a Recommendation approver, for the
 * Team Approvers picker — org-wide, not team-scoped, since assigning
 * approvers is `maintenance:edit` admin config, not a Users-module read.
 *
 * Deliberately **not** every active user: `approveRecommendationStep`/
 * `rejectRecommendationStep` (src/server/employee-recommendations/actions.ts)
 * gate on `employee_recommendations:approve`, then match
 * `approvalStep.approverUserId` directly against the signed-in user's own id
 * — so only accounts whose role actually holds that permission belong here.
 * See docs/EMPLOYEE_RECOMMENDATION.md §9.
 */
export async function listRecommendationApproverOptions(): Promise<LookupOption[]> {
  await authorize("maintenance:read");

  const rows = await db
    .select({ id: user.id, name: user.name, roleId: user.roleId, status: user.status, permissions: roleTable.permissions })
    .from(user)
    .innerJoin(roleTable, eq(roleTable.id, user.roleId));

  return rows
    .filter((row) =>
      can(
        { id: row.id, status: row.status, roleId: row.roleId, rank: 0, permissions: (row.permissions ?? []) as Permission[] },
        "employee_recommendations:approve",
      ),
    )
    .map((row) => ({ id: row.id, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
