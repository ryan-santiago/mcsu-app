import "server-only";

import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { oneLotProject, oneLotProjectMember } from "@/db/schema";
import { hasUnrestrictedAccess } from "@/lib/rbac";
import { authorize, type CurrentUser } from "@/lib/session";

export type OneLotProjectRow = {
  id: string;
  name: string;
};

/**
 * A project is visible to its creator, to anyone added as a member (matched
 * via the caller's linked Employee record), or to anyone with unrestricted
 * access — same bypass rule Employees' team-scoping uses. `staff_augmentation`
 * has no equivalent restriction; this is the one module in the app where
 * `read` alone isn't enough to see every row.
 */
function visibilityWhere(actor: CurrentUser) {
  if (hasUnrestrictedAccess(actor)) return undefined;

  const memberOf = db
    .select({ projectId: oneLotProjectMember.projectId })
    .from(oneLotProjectMember)
    .where(actor.employeeId ? eq(oneLotProjectMember.employeeId, actor.employeeId) : sql`false`);

  return or(eq(oneLotProject.createdBy, actor.id), inArray(oneLotProject.id, memberOf));
}

export async function listVisibleOneLotProjects(actor: CurrentUser): Promise<OneLotProjectRow[]> {
  await authorize("one_lot_projects:read");

  return db
    .select({ id: oneLotProject.id, name: oneLotProject.name })
    .from(oneLotProject)
    .where(visibilityWhere(actor))
    .orderBy(asc(oneLotProject.name));
}

export async function getOneLotProjectById(id: string, actor: CurrentUser): Promise<OneLotProjectRow | null> {
  await authorize("one_lot_projects:read");

  const where = visibilityWhere(actor);
  const [row] = await db
    .select({ id: oneLotProject.id, name: oneLotProject.name })
    .from(oneLotProject)
    .where(where ? and(eq(oneLotProject.id, id), where) : eq(oneLotProject.id, id))
    .limit(1);

  return row ?? null;
}
