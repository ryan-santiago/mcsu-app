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
  "announcements:read",
  "announcements:write",
  "announcements:edit",
  "announcements:delete",

  "users:read",
  "users:write",
  /** Covers create/update plus approve/reject, suspend/reinstate and role assignment. */
  "users:edit",
  "users:delete",

  "employees:read",
  "employees:write",
  "employees:edit",
  "employees:delete",
  /**
   * Same "Additional Permissions" treatment as Talent Acquisition's/Employee
   * Recommendation's stage permissions below — see docs/RBAC.md "Add a
   * permission". Without this, `employees:read` only sees the actor's own
   * team (`hasUnrestrictedAccess()` row-scoping in
   * `src/server/employees/queries.ts`) — this widens *reading* to every
   * team, for roles that need org-wide visibility without also getting
   * `hasUnrestrictedAccess()`'s full admin bypass (write access to any
   * team, overriding approval-step assignment elsewhere, etc.). Doesn't
   * affect `employees:write`/`:edit`/`:delete`, which stay team-scoped
   * (`assertEmployeeInScope`) regardless.
   */
  "employees:read_all",

  "projects:read",
  "projects:write",
  "projects:edit",
  "projects:delete",

  "employee_recommendations:read",
  "employee_recommendations:write",
  /** Covers editing a draft, submitting it, and applying an approved recommendation to employment history. */
  "employee_recommendations:edit",
  "employee_recommendations:delete",
  /**
   * Non-CRUD, same "Additional Permissions" treatment as Talent Acquisition's
   * stage-transition permissions above — see docs/RBAC.md "Add a permission".
   */
  /** Act on a pending approval step (Unit Manager / Department Head tier). */
  "employee_recommendations:approve",
  /** Generate the final ERF PDF and apply an approved recommendation to employment history — Talent Acquisition Manager only. */
  "employee_recommendations:generate_erf",

  "talent_acquisition:read",
  "talent_acquisition:write",
  /** Covers editing request/candidate details and uploading a CV. */
  "talent_acquisition:edit",
  "talent_acquisition:delete",
  /**
   * Stage-transition permissions, additive to the standard four above. These
   * don't get a column in the Access Control matrix's uniform Read/Write/
   * Edit/Delete grid (`role-permission-matrix.tsx`'s `MatrixBody` renders one
   * shared header row across every module) — instead they get their own
   * small "Additional Permissions" section in the same per-role dialog. See
   * docs/RBAC.md "Add a permission" for the general recipe; this is the one
   * deliberate deviation from "every module gets exactly four actions".
   */
  /** Mark L1 Assessment passed/failed. */
  "talent_acquisition:l1_assess",
  /** Be assignable to, and complete, L2 Assessment — Client Interview (if flagged) inherits the same assignee. */
  "talent_acquisition:l2_assess",
  /** Mark L3 Interview/Assessment (incl. background check) passed/failed — same grantee tier as l1_assess. */
  "talent_acquisition:l3_assess",
  /** Final Interview — the pipeline's last stage. */
  "talent_acquisition:finalize",
  /** Migrate a candidate into the Employee module. */
  "talent_acquisition:migrate",

  "maintenance:read",
  "maintenance:write",
  /** Covers update, activate and deactivate. */
  "maintenance:edit",
  "maintenance:delete",

  "devices:read",
  "devices:write",
  "devices:edit",
  "devices:delete",

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

  "staff_augmentation:read",
  "staff_augmentation:write",
  "staff_augmentation:edit",
  "staff_augmentation:delete",

  "one_lot_projects:read",
  "one_lot_projects:write",
  "one_lot_projects:edit",
  "one_lot_projects:delete",

  /**
   * Activity Report has no standard Read/Write/Edit/Delete grid row — every
   * active user manages their own reports ungated, same as Settings &
   * Profile (see src/server/activity-reports/queries.ts). This is purely
   * the org-wide monitoring capability, same "Additional Permissions"
   * treatment as `employees:read_all` above.
   */
  "activity_reports:read_all",

  /** Certifications' equivalent — self-service module, same reasoning. */
  "certifications:read_all",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The modules the Access Control matrix has one row for, in display order —
 * mirrors the sidebar's nav order (`NAVIGATION` in `src/lib/navigation.ts`).
 * `settings` has no sidebar entry yet, so it stays last.
 */
export const MODULES = [
  { id: "announcements", label: "Announcements" },
  { id: "employees", label: "Employees" },
  { id: "projects", label: "Projects" },
  { id: "employee_recommendations", label: "Employee Recommendation" },
  { id: "talent_acquisition", label: "Talent Acquisition" },
  { id: "staff_augmentation", label: "Staff Augmentation" },
  { id: "one_lot_projects", label: "One-Lot Projects" },
  { id: "maintenance", label: "Maintenance" },
  { id: "devices", label: "Device Inventory" },
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

/**
 * Talent Acquisition's stage-transition permissions — the one set of
 * permissions that doesn't fit the standard Read/Write/Edit/Delete grid (see
 * the comment above their entries in `PERMISSIONS`). Rendered as a small
 * second table in `RolePermissionMatrix`, keyed off this list rather than
 * `MODULES`/`ACTIONS`, so a future module needing the same treatment can
 * follow the same shape without touching the main grid.
 */
export const TALENT_ACQUISITION_STAGE_PERMISSIONS: readonly { permission: Permission; label: string }[] = [
  { permission: "talent_acquisition:l1_assess", label: "L1 Assessment" },
  { permission: "talent_acquisition:l2_assess", label: "L2 Assessment / Client Interview" },
  { permission: "talent_acquisition:l3_assess", label: "L3 Interview / Assessment" },
  { permission: "talent_acquisition:finalize", label: "Final Interview" },
  { permission: "talent_acquisition:migrate", label: "Migrate to Employee" },
];

/** Employee Recommendation's own non-CRUD permissions — same "Additional Permissions" treatment as Talent Acquisition's above. */
export const EMPLOYEE_RECOMMENDATION_STAGE_PERMISSIONS: readonly { permission: Permission; label: string }[] = [
  { permission: "employee_recommendations:approve", label: "Approve / Reject Recommendation" },
  { permission: "employee_recommendations:generate_erf", label: "Generate ERF / Apply to Employment History" },
];

/** Employees' own non-CRUD permission — same "Additional Permissions" treatment as the two above. */
export const EMPLOYEES_ADDITIONAL_PERMISSIONS: readonly { permission: Permission; label: string }[] = [
  { permission: "employees:read_all", label: "View Employees Org-Wide (not just own team)" },
];

/** Activity Report's only permission — see the comment on `activity_reports:read_all` above. */
export const ACTIVITY_REPORTS_ADDITIONAL_PERMISSIONS: readonly { permission: Permission; label: string }[] = [
  { permission: "activity_reports:read_all", label: "View Activity Reports Org-Wide (Monitoring)" },
];

/** Certifications' only permission — same "Additional Permissions" treatment as Activity Report's above. */
export const CERTIFICATIONS_ADDITIONAL_PERMISSIONS: readonly { permission: Permission; label: string }[] = [
  { permission: "certifications:read_all", label: "View Certifications Org-Wide (Monitoring)" },
];

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
 * Whether the principal's admin bypass extends to row-level scoping, not
 * just permission checks — e.g. Employees restricting non-admins to their
 * own team. Only `admin` qualifies today, mirroring the bypass `can()`
 * already grants it.
 */
export function hasUnrestrictedAccess(principal: Pick<Principal, "roleId"> | null | undefined): boolean {
  return !!principal && principal.roleId === "admin";
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
