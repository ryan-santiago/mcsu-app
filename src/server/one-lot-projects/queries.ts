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
 * A project's *content* (the Summary/Backlog/Kanban/Calendar pages) is
 * gated separately from the module permission: visible to the project's
 * creator, to anyone added as a member (matched via the caller's linked
 * Employee record), or to anyone with unrestricted access — same bypass
 * rule Employees' team-scoping uses. This is what stands in for the
 * per-project access-user module until that's built.
 */
function contentVisibilityWhere(actor: CurrentUser) {
  if (hasUnrestrictedAccess(actor)) return undefined;

  const memberOf = db
    .select({ projectId: oneLotProjectMember.projectId })
    .from(oneLotProjectMember)
    .where(actor.employeeId ? eq(oneLotProjectMember.employeeId, actor.employeeId) : sql`false`);

  return or(eq(oneLotProject.createdBy, actor.id), inArray(oneLotProject.id, memberOf));
}

/**
 * `one_lot_projects:read` alone is enough to see every project — the list
 * is not membership-scoped. Only a project's content (see
 * `contentVisibilityWhere`) is restricted to members.
 */
export async function listVisibleOneLotProjects(): Promise<OneLotProjectRow[]> {
  await authorize("one_lot_projects:read");

  return db
    .select({ id: oneLotProject.id, name: oneLotProject.name })
    .from(oneLotProject)
    .orderBy(asc(oneLotProject.name));
}

export async function getOneLotProjectById(id: string, actor: CurrentUser): Promise<OneLotProjectRow | null> {
  await authorize("one_lot_projects:read");

  const where = contentVisibilityWhere(actor);
  const [row] = await db
    .select({ id: oneLotProject.id, name: oneLotProject.name })
    .from(oneLotProject)
    .where(where ? and(eq(oneLotProject.id, id), where) : eq(oneLotProject.id, id))
    .limit(1);

  return row ?? null;
}
