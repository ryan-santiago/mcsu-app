import "server-only";

import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import type { UserRole, UserStatus } from "@/db/schema";
import { auth } from "@/lib/auth";
import { can, type Permission, type Principal } from "@/lib/rbac";

export type CurrentUser = Principal & {
  name: string;
  email: string;
  image: string | null;
  jobTitle: string | null;
  createdAt: Date;
};

/**
 * Reads the session for the current request.
 *
 * `cache()` dedupes it per render pass, so a layout, its page and any server
 * action helper can all call this without repeated cookie parsing or database
 * round trips.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) return null;

  const u = result.user as typeof result.user & {
    role?: UserRole;
    status?: UserStatus;
    jobTitle?: string | null;
  };

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    role: u.role ?? "viewer",
    status: u.status ?? "pending",
    jobTitle: u.jobTitle ?? null,
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
