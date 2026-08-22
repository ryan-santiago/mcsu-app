import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { role as roleTable, type UserStatus } from "@/db/schema";
import { auth } from "@/lib/auth";
import { can, canAny, type Permission, type Principal } from "@/lib/rbac";
import { getEmployeeIdentityByEmail } from "@/server/employees/identity";

export type CurrentUser = Principal & {
  name: string;
  /** The account name, unless a matching Employee record's name should be shown instead. */
  displayName: string;
  email: string;
  image: string | null;
  roleLabel: string;
  /** Latest "Level - Position" from the matching Employee record, if any. */
  position: string | null;
  /** The Employee record matched by email, if any — used to block self-service edits through the Employee module. */
  employeeId: string | null;
  /** The matched Employee record's team, if any — used to scope Employees module visibility for non-admins. */
  teamId: string | null;
  createdAt: Date;
};

/**
 * Reads the session for the current request.
 *
 * `cache()` dedupes it per render pass, so a layout, its page and any server
 * action helper can all call this without repeated cookie parsing or database
 * round trips. Permissions and rank come from the `role` table, not a static
 * map — one extra join per request, alongside the existing Employee-identity
 * lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() }).catch((error: unknown) => {
    // An expired or otherwise unreadable session must not crash the render —
    // treat it as signed-out so requireUser() redirects to /login instead of
    // surfacing the generic error boundary.
    console.error("[session] getSession failed", error);
    return null;
  });
  if (!result?.user) return null;

  const u = result.user as typeof result.user & {
    roleId?: string;
    status?: UserStatus;
  };

  const roleId = u.roleId ?? "viewer";

  const [roleRows, identity] = await Promise.all([
    db
      .select({ label: roleTable.label, rank: roleTable.rank, permissions: roleTable.permissions })
      .from(roleTable)
      .where(eq(roleTable.id, roleId))
      .limit(1),
    getEmployeeIdentityByEmail(u.email),
  ]);
  const roleRow = roleRows[0];

  return {
    id: u.id,
    name: u.name,
    displayName: identity?.displayName ?? u.name,
    email: u.email,
    image: u.image ?? null,
    roleId,
    roleLabel: roleRow?.label ?? roleId,
    rank: roleRow?.rank ?? 0,
    permissions: (roleRow?.permissions as Permission[] | undefined) ?? [],
    status: u.status ?? "pending",
    position: identity?.position ?? null,
    employeeId: identity?.id ?? null,
    teamId: identity?.teamId ?? null,
    createdAt: u.createdAt,
  };
});

/**
 * Requires a signed-in, active user. Redirects rather than throwing, so it can
 * be called straight from a layout.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/pending");

  return user;
}

/**
 * Requires a specific permission. Renders the nearest `forbidden.tsx` boundary
 * when the user is signed in but not allowed — a 403, not a redirect loop.
 */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission)) forbidden();
  return user;
}

/**
 * Server-action counterpart to `requirePermission`. Actions must not redirect
 * on an authorization failure — they return a result the client can render.
 */
export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function authorize(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) throw new AuthorizationError("Your session has expired. Please sign in again.");
  if (user.status !== "active") throw new AuthorizationError("Your account is not active.");
  if (!can(user, permission)) throw new AuthorizationError();

  return user;
}

/** Like `authorize()`, but passes when the actor holds any one of the given permissions. */
export async function authorizeAny(permissions: readonly Permission[]): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) throw new AuthorizationError("Your session has expired. Please sign in again.");
  if (user.status !== "active") throw new AuthorizationError("Your account is not active.");
  if (!canAny(user, permissions)) throw new AuthorizationError();

  return user;
}
