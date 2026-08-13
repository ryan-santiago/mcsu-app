import type { UserStatus } from "@/db/schema";

/* -------------------------------------------------------------------------- */
/*  Permissions                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every capability in the app, named `module:action`. Every module gets the
 * same four actions — even ones with no code path for a given action yet
 * (e.g. `audit:write` is permanently inert, the log is immutable) — so the
 * Access Control matrix (`src/components/roles/role-permission-matrix.tsx`)
 * is a uniform grid rather than a different shape per row.
 *
 * Code checks permissions, never roles — `can(user, "users:edit")` rather
 * than `user.roleId === "admin"`. What holds which permission now lives in
 * the `role` table (admin-editable via Access Control) instead of a code
 * constant — see docs/RBAC.md.
 */
export const PERMISSIONS = [
  "dashboard:read",
  "dashboard:write",
  "dashboard:edit",
  "dashboard:delete",

  "users:read",
  "users:write",
  /** Covers create/update plus approve/reject, suspend/reinstate and role assignment. */
  "users:edit",
  "users:delete",

  "employees:read",
  "employees:write",
  "employees:edit",
  "employees:delete",

  "projects:read",
  "projects:write",
  "projects:edit",
  "projects:delete",

  "maintenance:read",
  "maintenance:write",
  /** Covers update, activate and deactivate. */
  "maintenance:edit",
  "maintenance:delete",

  "audit:read",
  "audit:write",
  "audit:edit",
  "audit:delete",

  "settings:read",
  "settings:write",
  "settings:edit",
  "settings:delete",

  "access_control:read",
  "access_control:write",
  "access_control:edit",
  "access_control:delete",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The modules the Access Control matrix has one row for, in display order —
 * mirrors the sidebar's nav order (`NAVIGATION` in `src/lib/navigation.ts`).
 * `settings` has no sidebar entry yet, so it stays last.
 */
export const MODULES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "employees", label: "Employees" },
  { id: "projects", label: "Projects" },
  { id: "maintenance", label: "Maintenance" },
  { id: "access_control", label: "Access Control" },
  { id: "users", label: "Users & Access" },
  { id: "audit", label: "Audit Trail" },
  { id: "settings", label: "Settings" },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];

/** The columns of the Access Control matrix, in display order. */
export const ACTIONS = ["read", "write", "edit", "delete"] as const;

export type Action = (typeof ACTIONS)[number];

export function permissionFor(moduleId: ModuleId, action: Action): Permission {
  return `${moduleId}:${action}` as Permission;
}

/* -------------------------------------------------------------------------- */
/*  Roles                                                                    */
/* -------------------------------------------------------------------------- */

/** The shape a role picker needs — not the full row (no `permissions`, no `userCount`). */
export type RoleOption = {
  id: string;
  label: string;
  description: string | null;
  rank: number;
  isSystem: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Checks                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The minimum shape any permission check needs. `permissions` and `rank` are
 * loaded once per request from the user's role (`getCurrentUser()` in
 * `src/lib/session.ts`), not looked up from a static table — but `can()`
 * itself stays a pure, synchronous function so it's safe to call from client
 * components.
 */
export type Principal = {
  id: string;
  status: UserStatus;
  roleId: string;
  rank: number;
  permissions: readonly Permission[];
};

/**
 * Only `active` users hold permissions. A suspended admin is as powerless as
 * a pending registrant, which means revoking access is a single status flip.
 *
 * The `admin` role always holds every current permission, regardless of what
 * happens to be stored in its `role.permissions` row. Access Control already
 * displays it that way (`role-permission-matrix.tsx`'s `locked` state) and
 * refuses to let it be edited (`updateRolePermissions` in
 * `src/server/roles/actions.ts`) — checking it here too means a newly added
 * permission (a new module, a new action) is automatically available to
 * Administrator the moment it exists in code, with no DB backfill required.
 * Every other role's access comes entirely from its stored array.
 */
export function can(principal: Principal | null | undefined, permission: Permission): boolean {
  if (!principal || principal.status !== "active") return false;
  if (principal.roleId === "admin") return true;
  return principal.permissions.includes(permission);
}

export function canAny(principal: Principal | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(principal, permission));
}

export function canAll(principal: Principal | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => can(principal, permission));
}

/* -------------------------------------------------------------------------- */
/*  Rank rules                                                                */
/* -------------------------------------------------------------------------- */

export type RankedTarget = {
  id: string;
  rank: number;
  /** Shown in the deny message — e.g. "You cannot manage a user with the Administrator role." */
  roleLabel: string;
};

/**
 * Guards against privilege escalation and lateral attacks: a manager must not
 * be able to suspend an admin, and nobody may act on their own account through
 * the admin tools (use the profile screen, or another admin, instead).
 *
 * Returns a reason string when the action is disallowed, or `null` when it is
 * permitted — so callers can surface *why* a control is disabled.
 */
export function denyReasonForActingOn(actor: Pick<Principal, "id" | "rank">, target: RankedTarget): string | null {
  if (actor.id === target.id) {
    return "You cannot perform this action on your own account.";
  }
  if (target.rank > actor.rank) {
    return `You cannot manage a user with the ${target.roleLabel} role.`;
  }
  return null;
}

export function canActOn(actor: Pick<Principal, "id" | "rank">, target: RankedTarget): boolean {
  return denyReasonForActingOn(actor, target) === null;
}

/**
 * A user may only grant a role at or below their own rank — otherwise a
 * manager could promote a colleague to administrator and inherit that access.
 * `allRoles` is fetched server-side (`listRoleOptions()` in
 * `src/server/roles/queries.ts`) and passed in, since the role list is no
 * longer a static import.
 */
export function assignableRoles(actor: Principal, allRoles: readonly RoleOption[]): RoleOption[] {
  if (!can(actor, "users:edit")) return [];
  return allRoles.filter((role) => role.rank <= actor.rank).slice().sort((a, b) => b.rank - a.rank);
}

/* -------------------------------------------------------------------------- */
/*  Presentation helpers                                                      */
/* -------------------------------------------------------------------------- */

export const STATUS_LABELS: Record<UserStatus, string> = {
  pending: "Pending approval",
  active: "Active",
  suspended: "Suspended",
};

export const STATUS_DESCRIPTIONS: Record<UserStatus, string> = {
  pending: "Registered but not yet approved. Cannot sign in.",
  active: "Approved and able to sign in.",
  suspended: "Access revoked. Cannot sign in until reinstated.",
};
