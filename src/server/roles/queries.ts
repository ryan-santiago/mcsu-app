import "server-only";

import { asc, count, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { role, user } from "@/db/schema";
import type { Permission } from "@/lib/rbac";
import { authorize, authorizeAny } from "@/lib/session";

import type { Role, RoleOption } from "./types";

const FULL_SELECTION = {
  id: role.id,
  label: role.label,
  description: role.description,
  rank: role.rank,
  isSystem: role.isSystem,
  permissions: role.permissions,
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
  userCount: count(user.id),
};

/** Full rows for the Access Control screen, each carrying how many users currently hold it. */
export async function listRoles(): Promise<Role[]> {
  await authorize("access_control:read");

  const rows = await db
    .select(FULL_SELECTION)
    .from(role)
    .leftJoin(user, eq(user.roleId, role.id))
    .groupBy(role.id)
    .orderBy(desc(role.rank));

  return rows.map((row) => ({ ...row, permissions: row.permissions as Permission[] }));
}

/** Used by the permission-matrix dialog; returns null rather than throwing on a bad id. */
export async function getRoleById(id: string): Promise<Role | null> {
  await authorize("access_control:read");

  const [row] = await db
    .select(FULL_SELECTION)
    .from(role)
    .leftJoin(user, eq(user.roleId, role.id))
    .where(eq(role.id, id))
    .groupBy(role.id)
    .limit(1);

  if (!row) return null;
  return { ...row, permissions: row.permissions as Permission[] };
}

/**
 * Lightweight id/label/rank list for role pickers — the Users page's
 * assign-role dropdown, and Access Control's own list. Gated on either
 * `users:read` or `access_control:read` since both screens need it, unlike
 * `listRoles()` which is Access Control's own (fuller, more sensitive) read.
 */
export async function listRoleOptions(): Promise<RoleOption[]> {
  await authorizeAny(["users:read", "access_control:read"]);

  return db
    .select({
      id: role.id,
      label: role.label,
      description: role.description,
      rank: role.rank,
      isSystem: role.isSystem,
    })
    .from(role)
    .orderBy(asc(role.rank));
}
