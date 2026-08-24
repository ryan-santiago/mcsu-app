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
import { can, hasUnrestrictedAccess } from "@/lib/rbac";
import { authorizeActiveUser, AuthorizationError, type CurrentUser } from "@/lib/session";
import type { ProjectSearchOption } from "@/server/projects/types";
import type { AuditEntry } from "@/server/audit/types";

import type { OneLotProjectMemberRow, OneLotProjectS3pLinkRow, UserOption } from "./types";

export type OneLotProjectRow = {
  id: string;
  name: string;
};

/**
 * A project's *content* (the Summary/Backlog/Kanban/Calendar pages, and the
 * project list itself) is visible to: anyone holding `one_lot_projects:read`
 * (they can monitor every project, membership or not — the point of the
 * permission), the project's creator, anyone added as a member, or anyone
 * with unrestricted access. Only a user with *none* of those — no module
 * permission and no membership anywhere — is scoped down to nothing.
 */
function contentVisibilityWhere(actor: CurrentUser) {
  if (hasUnrestrictedAccess(actor) || can(actor, "one_lot_projects:read")) return undefined;

  const memberOf = db
    .select({ projectId: oneLotProjectMember.projectId })
    .from(oneLotProjectMember)
    .where(eq(oneLotProjectMember.userId, actor.id));

  return or(eq(oneLotProject.createdBy, actor.id), inArray(oneLotProject.id, memberOf));
}

/**
 * Visible to anyone with `one_lot_projects:read` (every project) or anyone
 * who is a member/creator of at least one project (just those) — see
 * `contentVisibilityWhere`. Returns an empty list for a user with neither,
 * which callers use to decide whether the module is reachable at all (nav
 * visibility, the module list page's own guard).
 */
export async function listVisibleOneLotProjects(actor: CurrentUser): Promise<OneLotProjectRow[]> {
  const where = contentVisibilityWhere(actor);

  return db
    .select({ id: oneLotProject.id, name: oneLotProject.name })
    .from(oneLotProject)
    .where(where)
    .orderBy(asc(oneLotProject.name));
}

export async function getOneLotProjectById(id: string, actor: CurrentUser): Promise<OneLotProjectRow | null> {
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

/**
 * Only reachable after the caller has already verified project-level content
 * access (`getOneLotProjectById`/`assertOneLotProjectContentAccess`) — this
 * itself just requires an active session, not the module permission, so a
 * project member without `one_lot_projects:read` can still see their own
 * project's roster.
 */
export async function listOneLotProjectMembers(projectId: string): Promise<OneLotProjectMemberRow[]> {
  await authorizeActiveUser();

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

/** Only reachable after project-level content access is already verified — see `listOneLotProjectMembers`. */
export async function listOneLotProjectS3pLinks(oneLotProjectId: string): Promise<OneLotProjectS3pLinkRow[]> {
  await authorizeActiveUser();

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
 * Only reachable after project-level content access is already verified —
 * see `listOneLotProjectMembers` — deliberately not gated on `audit:read`.
 */
export async function listOneLotProjectActivity(projectId: string, limit = 10): Promise<AuditEntry[]> {
  await authorizeActiveUser();

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
