import type { UserRole, UserStatus } from "@/db/schema";

/* -------------------------------------------------------------------------- */
/*  Permissions                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every capability in the app, named `resource:action`.
 *
 * Code checks permissions, never roles — `can(user, "users:approve")` rather
 * than `user.role === "admin"`. That keeps role changes to a single edit in
 * ROLE_PERMISSIONS instead of a grep across the codebase.
 */
export const PERMISSIONS = [
  "dashboard:view",

  "users:read",
  "users:create",
  "users:update",
  "users:approve",
  "users:suspend",
  "users:delete",
  "users:assign_role",

  "audit:read",
  "settings:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/* -------------------------------------------------------------------------- */
/*  Role definitions                                                          */
/* -------------------------------------------------------------------------- */

export type RoleDefinition = {
  label: string;
  description: string;
  /** Higher outranks lower. Used to stop a user editing someone above them. */
  rank: number;
  permissions: readonly Permission[];
};

const MANAGER_PERMISSIONS = [
  "dashboard:view",
  "users:read",
  "users:approve",
  "users:suspend",
  "users:update",
] as const satisfies readonly Permission[];

export const ROLES: Record<UserRole, RoleDefinition> = {
  admin: {
    label: "Administrator",
    description: "Full control of the workspace, including roles and settings.",
    rank: 40,
    permissions: PERMISSIONS,
  },
  manager: {
    label: "Manager",
    description: "Oversees the unit — approves and manages access.",
    rank: 30,
    permissions: MANAGER_PERMISSIONS,
  },
  engineer: {
    label: "Engineer",
    description: "Delivers services day to day.",
    rank: 20,
    permissions: ["dashboard:view"],
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access to dashboards.",
    rank: 10,
    permissions: ["dashboard:view"],
  },
};

export const ROLE_VALUES = Object.keys(ROLES) as UserRole[];

/** Roles ordered most-privileged first — the order used in every role picker. */
export const ROLES_BY_RANK = ROLE_VALUES.slice().sort((a, b) => ROLES[b].rank - ROLES[a].rank);

/* -------------------------------------------------------------------------- */
/*  Checks                                                                    */
/* -------------------------------------------------------------------------- */

/** The minimum shape any permission check needs. */
export type Principal = {
  id: string;
  role: UserRole;
  status: UserStatus;
};

/**
 * Only `active` users hold permissions. A suspended admin is as powerless as a
 * pending registrant, which means revoking access is a single status flip.
 */
export function can(principal: Principal | null | undefined, permission: Permission): boolean {
  if (!principal || principal.status !== "active") return false;
  return ROLES[principal.role].permissions.includes(permission);
}

export function canAny(principal: Principal | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(principal, permission));
}

export function canAll(principal: Principal | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => can(principal, permission));
}

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLES[role].permissions;
}

/* -------------------------------------------------------------------------- */
/*  Rank rules                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Guards against privilege escalation and lateral attacks: a manager must not
 * be able to suspend an admin, and nobody may act on their own account through
 * the admin tools (use the profile screen, or another admin, instead).
 *
 * Returns a reason string when the action is disallowed, or `null` when it is
 * permitted — so callers can surface *why* a control is disabled.
 */
export function denyReasonForActingOn(
  actor: Principal,
  target: Pick<Principal, "id" | "role">,
): string | null {
  if (actor.id === target.id) {
    return "You cannot perform this action on your own account.";
  }
  if (ROLES[target.role].rank > ROLES[actor.role].rank) {
    return `You cannot manage a user with the ${ROLES[target.role].label} role.`;
  }
  return null;
}

export function canActOn(actor: Principal, target: Pick<Principal, "id" | "role">): boolean {
  return denyReasonForActingOn(actor, target) === null;
}

/**
 * A user may only grant a role at or below their own rank — otherwise a manager
 * could promote a colleague to administrator and inherit that access.
 */
export function assignableRoles(actor: Principal): UserRole[] {
  if (!can(actor, "users:assign_role")) return [];
  return ROLES_BY_RANK.filter((role) => ROLES[role].rank <= ROLES[actor.role].rank);
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
