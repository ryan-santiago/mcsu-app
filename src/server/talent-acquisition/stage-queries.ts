import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { role, taCandidateStage, user } from "@/db/schema";
import type { Permission } from "@/lib/rbac";
import { authorize } from "@/lib/session";

import type { TaCandidateStageRow, UserOption } from "./stage-types";

export async function listTaCandidateStages(candidateId: string): Promise<TaCandidateStageRow[]> {
  await authorize("talent_acquisition:read");

  return db
    .select({
      id: taCandidateStage.id,
      candidateId: taCandidateStage.candidateId,
      stage: taCandidateStage.stage,
      status: taCandidateStage.status,
      assigneeId: taCandidateStage.assigneeId,
      assigneeName: user.name,
      notes: taCandidateStage.notes,
      completedAt: taCandidateStage.completedAt,
      createdAt: taCandidateStage.createdAt,
      updatedAt: taCandidateStage.updatedAt,
    })
    .from(taCandidateStage)
    .leftJoin(user, eq(taCandidateStage.assigneeId, user.id))
    .where(eq(taCandidateStage.candidateId, candidateId));
}

/**
 * Active users who currently hold `permission` — including the admin bypass,
 * matching `can()`'s special case. Small user roster in this app, so a full
 * scan + JS filter is simpler than a jsonb containment query. Used for the
 * L2 Assessment assignee picker.
 */
export async function listUsersWithPermission(permission: Permission): Promise<UserOption[]> {
  const rows = await db
    .select({ id: user.id, name: user.name, roleId: user.roleId, permissions: role.permissions })
    .from(user)
    .innerJoin(role, eq(user.roleId, role.id))
    .where(eq(user.status, "active"));

  return rows
    .filter((row) => row.roleId === "admin" || row.permissions.includes(permission))
    .map((row) => ({ id: row.id, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
