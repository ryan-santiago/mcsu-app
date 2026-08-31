import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { role, taApplicationStage, user } from "@/db/schema";
import type { Permission } from "@/lib/rbac";
import { authorize } from "@/lib/session";

import type { TaApplicationStageRow, UserOption } from "./stage-types";

export async function listTaApplicationStages(applicationId: string): Promise<TaApplicationStageRow[]> {
  await authorize("talent_acquisition:read");

  return db
    .select({
      id: taApplicationStage.id,
      applicationId: taApplicationStage.applicationId,
      stage: taApplicationStage.stage,
      status: taApplicationStage.status,
      assigneeId: taApplicationStage.assigneeId,
      assigneeName: user.name,
      notes: taApplicationStage.notes,
      clientFeedback: taApplicationStage.clientFeedback,
      proposedSalary: taApplicationStage.proposedSalary,
      proposedCommunicationAllowance: taApplicationStage.proposedCommunicationAllowance,
      proposedTransportationAllowance: taApplicationStage.proposedTransportationAllowance,
      completedAt: taApplicationStage.completedAt,
      createdAt: taApplicationStage.createdAt,
      updatedAt: taApplicationStage.updatedAt,
    })
    .from(taApplicationStage)
    .leftJoin(user, eq(taApplicationStage.assigneeId, user.id))
    .where(eq(taApplicationStage.applicationId, applicationId));
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
