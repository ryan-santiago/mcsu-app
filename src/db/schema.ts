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
 * Level, Gender, Team). Each is a *separate* physical table rather than one
 * generic table with a `category` column, so a foreign key can only ever
 * point at the right kind of row (a Position id can never land in a column
 * that expects a Level id).
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
    /** "PH00123456" or "123456" — manually entered, validated in Zod. */
    code: text("code").notNull().unique(),
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
    workEmail: text("work_email"),
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
    // Postgres allows multiple NULLs under a unique index, so employees
    // without a work email yet don't collide with each other.
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
 * employee list and profile show as the active role.
 *
 * `employmentType` stays a Postgres enum rather than a Maintenance lookup —
 * unlike Level and Position, it wasn't asked for as an admin-editable list.
 */
export const employmentType = pgEnum("employment_type", [
  "regular",
  "probationary",
  "contractual",
  "project_based",
  "consultant",
  "intern",
]);

export const employeeEmployment = pgTable(
  "employee_employment",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
    salary: numeric("salary", { precision: 12, scale: 2 }).notNull(),
    levelId: text("level_id")
      .notNull()
      .references(() => level.id, { onDelete: "restrict" }),
    positionId: text("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "restrict" }),
    employmentType: employmentType("employment_type").notNull(),
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
export type EmploymentType = (typeof employmentType.enumValues)[number];
