import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/*  Enums                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `pending` users have registered but have not been approved yet: they hold no
 * role and cannot obtain a session. `suspended` users keep their role but are
 * locked out.
 */
export const userStatus = pgEnum("user_status", ["pending", "active", "suspended"]);

/* -------------------------------------------------------------------------- */
/*  Roles — the RBAC anchor                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Roles and the permissions they grant are admin-editable at runtime (see
 * docs/RBAC.md and the Access Control screen), so this is a table rather than
 * a fixed enum. `permissions` stores `Permission` strings (`src/lib/rbac.ts`)
 * as plain `text[]` rather than importing that type here, to keep `schema.ts`
 * free of a dependency on `lib/`; the roles query/action layer validates the
 * array's shape at the boundary instead.
 *
 * `rank` preserves the pre-existing hierarchy rules — who may act on whom,
 * and which roles someone may grant — now as an admin-settable field instead
 * of a hardcoded constant. `isSystem` roles (Administrator, Manager) cannot be
 * deleted; Administrator's `permissions` are additionally locked in the
 * action layer (`src/server/roles/actions.ts`) so the workspace can never
 * accidentally lock itself out.
 */
export const role = pgTable(
  "role",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    description: text("description"),
    rank: integer("rank").notNull(),
    isSystem: boolean("is_system").default(false).notNull(),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("role_rank_idx").on(table.rank)],
);

/* -------------------------------------------------------------------------- */
/*  BetterAuth core tables                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Matches BetterAuth's expected `user` model, extended with the MCSU fields
 * declared under `user.additionalFields` in `src/lib/auth.ts`. Column names on
 * the JS side must stay in sync with that config.
 */
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified")
      .$defaultFn(() => false)
      .notNull(),
    image: text("image"),

    // --- MCSU fields ---
    // `restrict`: a role in use by a user can't be deleted — same policy as
    // `employee.genderId`/`employeeEmployment.levelId` protecting Maintenance
    // lookups still referenced by historical rows.
    roleId: text("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "restrict" }),
    status: userStatus("status").default("pending").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("user_status_idx").on(table.status), index("user_role_id_idx").on(table.roleId)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/* -------------------------------------------------------------------------- */
/*  Audit trail                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One entry in a field-level diff — what changed, from what, to what.
 * `label` is the human-readable column header ("Role"); `field` is the
 * machine key ("role"). Stored as JSON, produced by `diffFields()` in
 * `src/lib/audit.ts`.
 */
export type AuditChange = {
  field: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
};

/**
 * Append-only, generic across every module the app will ever have.
 *
 * `module` and `action` are plain text, not DB enums — like `Permission` in
 * `src/lib/rbac.ts`, the canonical list lives in code (`AUDIT_MODULES` in
 * `src/lib/audit.ts`) so a future module can start writing audit entries
 * without a migration. `entityId` deliberately has no foreign key: a single
 * audit table can't reference N different future domain tables, so it's a
 * plain snapshot, not a live reference. `entityLabel` is captured at write
 * time for the same reason — it must still read correctly after the entity
 * itself is renamed or deleted.
 *
 * `actorId` is null for system-driven events (e.g. bootstrapping the first
 * admin); `changes` is null for pure events that have no before/after state
 * (login, logout).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    module: text("module").notNull(),
    action: text("action").notNull(),
    entityId: text("entity_id"),
    entityLabel: text("entity_label"),
    changes: jsonb("changes").$type<AuditChange[]>(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("audit_log_created_at_idx").on(table.createdAt),
    index("audit_log_actor_id_idx").on(table.actorId),
    index("audit_log_module_idx").on(table.module),
    index("audit_log_entity_idx").on(table.entityId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Employee module — Maintenance lookups                                    */
/* -------------------------------------------------------------------------- */

/**
 * Shared shape for every Maintenance-managed lookup list (Client, Position,
 * Level, Employment Type, Gender, Team, ...). Each is a *separate* physical
 * table rather than one generic table with a `category` column, so a
 * foreign key can only ever point at the right kind of row (a Position id
 * can never land in a column that expects a Level id).
 *
 * `isActive` lets an admin retire a value without breaking historical rows
 * that still reference it: inactive entries drop out of pickers for new
 * records but stay valid wherever they're already assigned.
 */
function lookupColumns() {
  return {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  };
}

export const client = pgTable("client", lookupColumns, (table) => [
  uniqueIndex("client_name_idx").on(table.name),
]);

export const position = pgTable("position", lookupColumns, (table) => [
  uniqueIndex("position_name_idx").on(table.name),
]);

export const level = pgTable("level", lookupColumns, (table) => [
  uniqueIndex("level_name_idx").on(table.name),
]);

/**
 * Table name is `employment_type_lookup`, not `employment_type` — it was
 * created (drizzle/0022) while the legacy `employment_type` enum type still
 * existed and claimed that name; the enum is gone now (0025), but renaming
 * the table to match wasn't worth a further migration.
 */
export const employmentType = pgTable("employment_type_lookup", lookupColumns, (table) => [
  uniqueIndex("employment_type_lookup_name_idx").on(table.name),
]);

export const gender = pgTable("gender", lookupColumns, (table) => [
  uniqueIndex("gender_name_idx").on(table.name),
]);

export const team = pgTable("team", lookupColumns, (table) => [
  uniqueIndex("team_name_idx").on(table.name),
]);

export const salesRepresentative = pgTable("sales_representative", lookupColumns, (table) => [
  uniqueIndex("sales_representative_name_idx").on(table.name),
]);

export const solutionsManager = pgTable("solutions_manager", lookupColumns, (table) => [
  uniqueIndex("solutions_manager_name_idx").on(table.name),
]);

export const engagementType = pgTable("engagement_type", lookupColumns, (table) => [
  uniqueIndex("engagement_type_name_idx").on(table.name),
]);

/* -------------------------------------------------------------------------- */
/*  Projects module — S3P (Sales Profit Projection per Project)              */
/* -------------------------------------------------------------------------- */

/**
 * The master project record. `s3pNumber` is manually entered and unique, the
 * same convention as `employee.code`. `salesRepresentativeId`/
 * `solutionsManagerId`/`engagementTypeId`/`startDate`/`endDate` are nullable
 * here — a project's identity (S3P Number/Name/Client) is known immediately,
 * assignments can follow — but the create/edit form requires them, the same
 * "nullable column, required field" split already used for
 * `employee.teamId`.
 */
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    s3pNumber: text("s3p_number").notNull().unique(),
    /** What Employee deployment history picks from — see `employeeDeployment.projectId`. */
    name: text("name").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    salesRepresentativeId: text("sales_representative_id").references(() => salesRepresentative.id, {
      onDelete: "restrict",
    }),
    solutionsManagerId: text("solutions_manager_id").references(() => solutionsManager.id, {
      onDelete: "restrict",
    }),
    engagementTypeId: text("engagement_type_id").references(() => engagementType.id, { onDelete: "restrict" }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("project_client_idx").on(table.clientId)],
);

/**
 * Alternate names a project is also known/invoiced under — distinct from the
 * Maintenance-managed `client` the project belongs to. A short unordered
 * list, edited inline with the project (whole-list replace on save), not a
 * dated history table like employments/deployments.
 */
export const projectClientName = pgTable(
  "project_client_name",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("project_client_name_project_idx").on(table.projectId)],
);

/**
 * One S3P financial line per row. `estimatedGrossProfit` is deliberately not
 * stored — it's `contractPrice - estimatedCost`, computed wherever it's
 * shown (per line and summed for the project total), so it can never drift
 * from the two numbers it's derived from.
 */
export const projectDetail = pgTable(
  "project_detail",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    contractPrice: numeric("contract_price", { precision: 12, scale: 2 }).notNull(),
    estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("project_detail_project_idx").on(table.projectId)],
);

/** Multiple teams may be assigned to a single S3P detail line. */
export const projectDetailTeam = pgTable(
  "project_detail_team",
  {
    id: text("id").primaryKey(),
    projectDetailId: text("project_detail_id")
      .notNull()
      .references(() => projectDetail.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("project_detail_team_detail_team_idx").on(table.projectDetailId, table.teamId)],
);

/* -------------------------------------------------------------------------- */
/*  Employee module — core record                                            */
/* -------------------------------------------------------------------------- */

export const employee = pgTable(
  "employee",
  {
    id: text("id").primaryKey(),
    /** "PH00123456" or "123456" — manually entered, validated in Zod. Optional: a plain UNIQUE constraint (not a unique index) still allows multiple NULLs in Postgres. */
    code: text("code").unique(),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    genderId: text("gender_id")
      .notNull()
      .references(() => gender.id, { onDelete: "restrict" }),
    /** PH mobile format, validated in Zod. */
    mobileNumber: text("mobile_number").notNull(),
    viberNumber: text("viber_number"),
    personalEmail: text("personal_email"),
    /** Required — also the account-matching key `getEmployeeIdentityByEmail` uses to link a signed-in user to their own record. */
    workEmail: text("work_email").notNull(),
    teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
    resignationDate: date("resignation_date"),
    /** Always derived from `resignationDate` in the action layer — never a direct user input. */
    isResigned: boolean("is_resigned").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("employee_last_name_idx").on(table.lastName),
    uniqueIndex("employee_work_email_idx").on(table.workEmail),
  ],
);

/**
 * One row per address per employee (`current` and `permanent`). Region,
 * province, city/municipality and barangay names are snapshotted alongside
 * their PSGC codes — same reasoning as `auditLog.entityLabel` — so an address
 * still reads correctly even if the bundled PSGC dataset is later updated.
 *
 * `latitude`/`longitude` are nullable and unused by any UI today; they exist
 * so a future OpenStreetMap pin is a pure addition, not a migration.
 */
export const employeeAddressType = pgEnum("employee_address_type", ["current", "permanent"]);

export const employeeAddress = pgTable(
  "employee_address",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
    type: employeeAddressType("type").notNull(),
    regionCode: text("region_code").notNull(),
    regionName: text("region_name").notNull(),
    // Null only in principle — the bundled PSGC dataset models NCR's
    // districts/cities as province-level entries too, so every address in
    // practice has a province.
    provinceCode: text("province_code"),
    provinceName: text("province_name"),
    cityCode: text("city_code").notNull(),
    cityName: text("city_name").notNull(),
    barangayCode: text("barangay_code").notNull(),
    barangayName: text("barangay_name").notNull(),
    /** House/unit/building number and street. */
    addressLine: text("address_line").notNull(),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("employee_address_employee_type_idx").on(table.employeeId, table.type)],
);

/**
 * Historical employment records. `endDate` null means "current" — the row
 * with no end date (or, failing that, the latest `startDate`) is what the
 * employee list and profile show as the active role. `employmentTypeId`
 * used to be a fixed Postgres enum — converted to a Maintenance-managed
 * lookup (like Level/Position) in drizzle/0022–0025.
 */
export const employeeEmployment = pgTable(
  "employee_employment",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
    salary: numeric("salary", { precision: 12, scale: 2 }).notNull(),
    communicationAllowance: numeric("communication_allowance", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    transportationAllowance: numeric("transportation_allowance", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    levelId: text("level_id")
      .notNull()
      .references(() => level.id, { onDelete: "restrict" }),
    positionId: text("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "restrict" }),
    employmentTypeId: text("employment_type_id")
      .notNull()
      .references(() => employmentType.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("employee_employment_employee_idx").on(table.employeeId),
    index("employee_employment_employee_end_idx").on(table.employeeId, table.endDate),
  ],
);

/** Historical client/project deployment records. */
export const employeeDeployment = pgTable(
  "employee_deployment",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("employee_deployment_employee_idx").on(table.employeeId),
    index("employee_deployment_employee_end_idx").on(table.employeeId, table.endDate),
  ],
);

/**
 * A self-service edit of the employee's own Identity/Contact/Address fields,
 * awaiting review. `employees:edit` holders write directly through the
 * Employee module; a user editing the one Employee record linked to their
 * own account goes through this instead (see `denyReasonForActingOn` in
 * `src/lib/rbac.ts` for the same "no self-service through the admin tools"
 * rule applied to user accounts). `proposed*` columns hold the full proposed
 * values (applied on approval); `changes` snapshots the `diffFields()` output
 * at submission time so the review UI never has to recompute a diff against
 * a record that may have moved on since.
 */
export const changeRequestStatus = pgEnum("change_request_status", ["pending", "approved", "rejected"]);

export const employeeChangeRequest = pgTable(
  "employee_change_request",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    status: changeRequestStatus("status").default("pending").notNull(),
    proposedProfile: jsonb("proposed_profile").notNull(),
    proposedCurrentAddress: jsonb("proposed_current_address").notNull(),
    proposedPermanentAddress: jsonb("proposed_permanent_address").notNull(),
    changes: jsonb("changes").$type<AuditChange[]>().notNull(),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("employee_change_request_employee_idx").on(table.employeeId),
    index("employee_change_request_status_idx").on(table.status),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Device Inventory module                                                  */
/* -------------------------------------------------------------------------- */

export const deviceType = pgEnum("device_type", ["laptop", "phone"]);

/**
 * `available`/`under_repair`/`retired` are set by hand; `deployed` is also
 * set by hand rather than derived from `deviceDeployment` — keeping Status
 * and "who currently has it" as two independent fields avoids having to
 * define what should happen to one when the other changes underneath it
 * (e.g. an admin marking a device "Under Repair" while it's still assigned).
 */
export const deviceStatus = pgEnum("device_status", ["available", "deployed", "under_repair", "retired"]);

export const device = pgTable(
  "device",
  {
    id: text("id").primaryKey(),
    deviceType: deviceType("device_type").notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    os: text("os").notNull(),
    serialNumber: text("serial_number").notNull().unique(),
    purchaseDate: date("purchase_date").notNull(),
    status: deviceStatus("status").default("available").notNull(),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("device_serial_number_idx").on(table.serialNumber)],
);

/**
 * Historical device assignment records — which employee had this device,
 * over time. `endDate` null means "current holder", same convention as
 * `employeeEmployment`/`employeeDeployment`. Both FKs cascade: deleting a
 * device or an employee removes that device's own history rows, the same
 * policy `employeeDeployment` already uses for `employeeId`.
 */
export const deviceDeployment = pgTable(
  "device_deployment",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => device.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("device_deployment_device_idx").on(table.deviceId),
    index("device_deployment_device_end_idx").on(table.deviceId, table.endDate),
    index("device_deployment_employee_idx").on(table.employeeId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Activity Report module                                                   */
/* -------------------------------------------------------------------------- */

export const activityReportStatus = pgEnum("activity_report_status", ["present", "on_leave"]);

/**
 * A self-service daily log — at most one per employee per date, enforced by
 * the unique index below (and a friendlier pre-check in the action layer).
 * `timeIn`/`timeOut` use Postgres `time`, same string-mode convention as
 * `date` throughout this file (reads/writes as plain `"HH:mm:ss"`, no
 * timezone). "Day" is deliberately not a column — it's always derived from
 * `date` for display, never stored, so it can't drift from it.
 * `timeIn`/`timeOut`/`otHours` are nullable — an `on_leave` day has none of
 * them, enforced in the action layer rather than a DB constraint.
 */
export const activityReport = pgTable(
  "activity_report",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: activityReportStatus("status").notNull().default("present"),
    timeIn: time("time_in"),
    timeOut: time("time_out"),
    otHours: numeric("ot_hours", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("activity_report_employee_date_idx").on(table.employeeId, table.date),
    index("activity_report_date_idx").on(table.date),
  ],
);

/**
 * A report's activity line items — no independent lifecycle of their own,
 * edited together with the report header in one form submit and
 * whole-list-replaced on every save (same convention as
 * `projectClientName`). `activityCode` is free-text the employee types
 * (e.g. a ticket number), not a foreign key — named to avoid reading like
 * the row's own `id`. `sortOrder` preserves entry order, since
 * delete-all-and-reinsert doesn't otherwise guarantee read order.
 */
export const activityReportItem = pgTable(
  "activity_report_item",
  {
    id: text("id").primaryKey(),
    activityReportId: text("activity_report_id")
      .notNull()
      .references(() => activityReport.id, { onDelete: "cascade" }),
    activityCode: text("activity_code").notNull(),
    activityName: text("activity_name").notNull(),
    description: text("description").notNull(),
    issueBlockers: text("issue_blockers"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("activity_report_item_report_idx").on(table.activityReportId)],
);

/* -------------------------------------------------------------------------- */
/*  Relations                                                                 */
/* -------------------------------------------------------------------------- */

export const roleRelations = relations(role, ({ many }) => ({
  users: many(user),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  role: one(role, { fields: [user.roleId], references: [role.id] }),
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, { fields: [auditLog.actorId], references: [user.id] }),
}));

export const employeeRelations = relations(employee, ({ one, many }) => ({
  gender: one(gender, { fields: [employee.genderId], references: [gender.id] }),
  team: one(team, { fields: [employee.teamId], references: [team.id] }),
  addresses: many(employeeAddress),
  employments: many(employeeEmployment),
  deployments: many(employeeDeployment),
  deviceDeployments: many(deviceDeployment),
  activityReports: many(activityReport),
}));

export const employeeAddressRelations = relations(employeeAddress, ({ one }) => ({
  employee: one(employee, { fields: [employeeAddress.employeeId], references: [employee.id] }),
}));

export const employeeEmploymentRelations = relations(employeeEmployment, ({ one }) => ({
  employee: one(employee, { fields: [employeeEmployment.employeeId], references: [employee.id] }),
  level: one(level, { fields: [employeeEmployment.levelId], references: [level.id] }),
  position: one(position, { fields: [employeeEmployment.positionId], references: [position.id] }),
}));

export const employeeDeploymentRelations = relations(employeeDeployment, ({ one }) => ({
  employee: one(employee, { fields: [employeeDeployment.employeeId], references: [employee.id] }),
  client: one(client, { fields: [employeeDeployment.clientId], references: [client.id] }),
  project: one(project, { fields: [employeeDeployment.projectId], references: [project.id] }),
}));

export const employeeChangeRequestRelations = relations(employeeChangeRequest, ({ one }) => ({
  employee: one(employee, { fields: [employeeChangeRequest.employeeId], references: [employee.id] }),
  requestedByUser: one(user, { fields: [employeeChangeRequest.requestedBy], references: [user.id] }),
  reviewedByUser: one(user, { fields: [employeeChangeRequest.reviewedBy], references: [user.id] }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
  client: one(client, { fields: [project.clientId], references: [client.id] }),
  salesRepresentative: one(salesRepresentative, {
    fields: [project.salesRepresentativeId],
    references: [salesRepresentative.id],
  }),
  solutionsManager: one(solutionsManager, {
    fields: [project.solutionsManagerId],
    references: [solutionsManager.id],
  }),
  engagementType: one(engagementType, { fields: [project.engagementTypeId], references: [engagementType.id] }),
  clientNames: many(projectClientName),
  details: many(projectDetail),
  deployments: many(employeeDeployment),
}));

export const projectClientNameRelations = relations(projectClientName, ({ one }) => ({
  project: one(project, { fields: [projectClientName.projectId], references: [project.id] }),
}));

export const projectDetailRelations = relations(projectDetail, ({ one, many }) => ({
  project: one(project, { fields: [projectDetail.projectId], references: [project.id] }),
  teams: many(projectDetailTeam),
}));

export const projectDetailTeamRelations = relations(projectDetailTeam, ({ one }) => ({
  detail: one(projectDetail, { fields: [projectDetailTeam.projectDetailId], references: [projectDetail.id] }),
  team: one(team, { fields: [projectDetailTeam.teamId], references: [team.id] }),
}));

export const deviceRelations = relations(device, ({ many }) => ({
  deployments: many(deviceDeployment),
}));

export const deviceDeploymentRelations = relations(deviceDeployment, ({ one }) => ({
  device: one(device, { fields: [deviceDeployment.deviceId], references: [device.id] }),
  employee: one(employee, { fields: [deviceDeployment.employeeId], references: [employee.id] }),
}));

export const activityReportRelations = relations(activityReport, ({ one, many }) => ({
  employee: one(employee, { fields: [activityReport.employeeId], references: [employee.id] }),
  items: many(activityReportItem),
}));

export const activityReportItemRelations = relations(activityReportItem, ({ one }) => ({
  report: one(activityReport, { fields: [activityReportItem.activityReportId], references: [activityReport.id] }),
}));

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                            */
/* -------------------------------------------------------------------------- */

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type Role = typeof role.$inferSelect;
export type UserStatus = (typeof userStatus.enumValues)[number];

export type Client = typeof client.$inferSelect;
export type Position = typeof position.$inferSelect;
export type Level = typeof level.$inferSelect;
export type Gender = typeof gender.$inferSelect;
export type Team = typeof team.$inferSelect;
export type SalesRepresentative = typeof salesRepresentative.$inferSelect;
export type SolutionsManager = typeof solutionsManager.$inferSelect;
export type EngagementType = typeof engagementType.$inferSelect;

export type Project = typeof project.$inferSelect;
export type NewProject = typeof project.$inferInsert;
export type ProjectClientName = typeof projectClientName.$inferSelect;
export type ProjectDetail = typeof projectDetail.$inferSelect;
export type NewProjectDetail = typeof projectDetail.$inferInsert;
export type ProjectDetailTeam = typeof projectDetailTeam.$inferSelect;

export type Employee = typeof employee.$inferSelect;
export type NewEmployee = typeof employee.$inferInsert;
export type EmployeeAddress = typeof employeeAddress.$inferSelect;
export type NewEmployeeAddress = typeof employeeAddress.$inferInsert;
export type EmployeeEmployment = typeof employeeEmployment.$inferSelect;
export type NewEmployeeEmployment = typeof employeeEmployment.$inferInsert;
export type EmployeeDeployment = typeof employeeDeployment.$inferSelect;
export type NewEmployeeDeployment = typeof employeeDeployment.$inferInsert;

export type EmployeeAddressType = (typeof employeeAddressType.enumValues)[number];

export type EmployeeChangeRequest = typeof employeeChangeRequest.$inferSelect;
export type NewEmployeeChangeRequest = typeof employeeChangeRequest.$inferInsert;
export type ChangeRequestStatus = (typeof changeRequestStatus.enumValues)[number];

export type Device = typeof device.$inferSelect;
export type NewDevice = typeof device.$inferInsert;
export type DeviceType = (typeof deviceType.enumValues)[number];
export type DeviceStatus = (typeof deviceStatus.enumValues)[number];
export type DeviceDeployment = typeof deviceDeployment.$inferSelect;
export type NewDeviceDeployment = typeof deviceDeployment.$inferInsert;

export type ActivityReport = typeof activityReport.$inferSelect;
export type NewActivityReport = typeof activityReport.$inferInsert;
export type ActivityReportStatus = (typeof activityReportStatus.enumValues)[number];
export type ActivityReportItem = typeof activityReportItem.$inferSelect;
export type NewActivityReportItem = typeof activityReportItem.$inferInsert;
