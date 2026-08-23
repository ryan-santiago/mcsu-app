import "server-only";

import { and, asc, desc, eq, inArray, ilike, ne, notInArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  auditLog,
  oneLotProject,
  oneLotProjectMember,
  oneLotProjectS3pProject,
  project,
  user,
} from "@/db/schema";
import { hasUnrestrictedAccess } from "@/lib/rbac";
import { authorize, AuthorizationError, type CurrentUser } from "@/lib/session";
import type { ProjectSearchOption } from "@/server/projects/types";
import type { AuditEntry } from "@/server/audit/types";

import type { OneLotProjectMemberRow, OneLotProjectS3pLinkRow, UserOption } from "./types";

export type OneLotProjectRow = {
  id: string;
  name: string;
};

/**
 * A project's *content* (the Summary/Backlog/Kanban/Calendar pages) is
 * gated separately from the module permission: visible to the project's
 * creator, to anyone added as a member, or to anyone with unrestricted
 * access — same bypass rule Employees' team-scoping uses. This is what
 * stands in for the per-project access-user module until that's built.
 */
function contentVisibilityWhere(actor: CurrentUser) {
  if (hasUnrestrictedAccess(actor)) return undefined;

  const memberOf = db
    .select({ projectId: oneLotProjectMember.projectId })
    .from(oneLotProjectMember)
    .where(eq(oneLotProjectMember.userId, actor.id));

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

/**
 * Same lookup as `getOneLotProjectById` but skips content-visibility —
 * used by the member/S3P-link management actions, which are gated purely on
 * `one_lot_projects:edit`/`:delete` (a global RBAC permission), not on
 * whether the actor can otherwise see this specific project's content.
 */
export async function getOneLotProjectByIdUnrestricted(id: string): Promise<OneLotProjectRow | null> {
  await authorize("one_lot_projects:read");

  const [row] = await db
    .select({ id: oneLotProject.id, name: oneLotProject.name })
    .from(oneLotProject)
    .where(eq(oneLotProject.id, id))
    .limit(1);

  return row ?? null;
}

/**
 * Content-access gate for Backlog/Sprint/work-item actions — reuses
 * `getOneLotProjectById` itself rather than re-deriving
 * `contentVisibilityWhere`, since that function already *is* "does this
 * actor have content access to this project." Throws the same
 * `AuthorizationError` every action's `run()` wrapper already catches.
 */
export async function assertOneLotProjectContentAccess(
  projectId: string,
  actor: CurrentUser,
): Promise<OneLotProjectRow> {
  const project = await getOneLotProjectById(projectId, actor);
  if (!project) throw new AuthorizationError("You do not have access to this project.");
  return project;
}

export async function listOneLotProjectMembers(projectId: string): Promise<OneLotProjectMemberRow[]> {
  await authorize("one_lot_projects:read");

  return db
    .select({
      id: oneLotProjectMember.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      addedAt: oneLotProjectMember.createdAt,
    })
    .from(oneLotProjectMember)
    .innerJoin(user, eq(user.id, oneLotProjectMember.userId))
    .where(eq(oneLotProjectMember.projectId, projectId))
    .orderBy(asc(user.name));
}

/**
 * Users eligible to be added as a member: excludes the `admin` role (they
 * already bypass content-visibility gating, see `hasUnrestrictedAccess`),
 * inactive accounts, and anyone already a member of this project. Not
 * authorization-gated itself — the caller (`fetchOneLotProjectMemberOptions`)
 * gates on `one_lot_projects:edit`.
 */
export async function listOneLotProjectMemberOptions(projectId: string, search?: string): Promise<UserOption[]> {
  const alreadyMember = db
    .select({ userId: oneLotProjectMember.userId })
    .from(oneLotProjectMember)
    .where(eq(oneLotProjectMember.projectId, projectId));

  const term = search?.trim();
  const searchClause = term ? or(ilike(user.name, `%${term}%`), ilike(user.email, `%${term}%`)) : undefined;

  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      and(
        ne(user.roleId, "admin"),
        eq(user.status, "active"),
        notInArray(user.id, alreadyMember),
        ...(searchClause ? [searchClause] : []),
      ),
    )
    .orderBy(asc(user.name))
    .limit(20);
}

export async function listOneLotProjectS3pLinks(oneLotProjectId: string): Promise<OneLotProjectS3pLinkRow[]> {
  await authorize("one_lot_projects:read");

  return db
    .select({
      id: oneLotProjectS3pProject.id,
      projectId: project.id,
      s3pNumber: project.s3pNumber,
      name: project.name,
      linkedAt: oneLotProjectS3pProject.createdAt,
    })
    .from(oneLotProjectS3pProject)
    .innerJoin(project, eq(project.id, oneLotProjectS3pProject.projectId))
    .where(eq(oneLotProjectS3pProject.oneLotProjectId, oneLotProjectId))
    .orderBy(asc(project.name));
}

/**
 * S3P projects not yet linked to this one-lot project — feeds the link
 * picker. Not authorization-gated itself, same convention as
 * `searchProjectOptions`; the caller (`searchOneLotProjectS3pProjects`)
 * gates on `one_lot_projects:edit`.
 */
export async function searchOneLotProjectS3pOptions(
  oneLotProjectId: string,
  search: string,
): Promise<ProjectSearchOption[]> {
  const alreadyLinked = db
    .select({ projectId: oneLotProjectS3pProject.projectId })
    .from(oneLotProjectS3pProject)
    .where(eq(oneLotProjectS3pProject.oneLotProjectId, oneLotProjectId));

  const term = search.trim();
  const searchClause = term ? or(ilike(project.s3pNumber, `%${term}%`), ilike(project.name, `%${term}%`)) : undefined;

  return db
    .select({
      id: project.id,
      s3pNumber: project.s3pNumber,
      name: project.name,
      clientId: project.clientId,
      startDate: project.startDate,
      endDate: project.endDate,
    })
    .from(project)
    .where(and(notInArray(project.id, alreadyLinked), ...(searchClause ? [searchClause] : [])))
    .orderBy(asc(project.name))
    .limit(20);
}

/**
 * Recent Activity card — real audit-trail-shaped data scoped to this
 * project, so a Summary viewer without Audit Trail access still sees it.
 * Gated on `one_lot_projects:read`, deliberately not `audit:read`.
 */
export async function listOneLotProjectActivity(projectId: string, limit = 10): Promise<AuditEntry[]> {
  await authorize("one_lot_projects:read");

  const rows = await db
    .select({
      id: auditLog.id,
      module: auditLog.module,
      action: auditLog.action,
      entityId: auditLog.entityId,
      entityLabel: auditLog.entityLabel,
      changes: auditLog.changes,
      actorId: auditLog.actorId,
      actorEmail: auditLog.actorEmail,
      actorName: user.name,
      ipAddress: auditLog.ipAddress,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorId, user.id))
    .where(and(eq(auditLog.module, "one_lot_projects"), eq(auditLog.entityId, projectId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return rows as AuditEntry[];
}
