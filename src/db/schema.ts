import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
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
 * Role names are the RBAC anchor. The permissions each role grants live in
 * `src/lib/rbac.ts` rather than in the database — see docs/RBAC.md for why, and
 * for the migration path to database-driven roles.
 */
export const userRole = pgEnum("user_role", ["admin", "manager", "engineer", "viewer"]);

/**
 * `pending` users have registered but have not been approved yet: they hold no
 * role and cannot obtain a session. `suspended` users keep their role but are
 * locked out.
 */
export const userStatus = pgEnum("user_status", ["pending", "active", "suspended"]);

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
    role: userRole("role").default("viewer").notNull(),
    status: userStatus("status").default("pending").notNull(),
    jobTitle: text("job_title"),
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
  (table) => [index("user_status_idx").on(table.status), index("user_role_idx").on(table.role)],
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

/**
 * Historical client/project deployment records. `project` is a plain text
 * column rather than a foreign key — the Projects module doesn't exist yet;
 * this migrates to a real reference once it does.
 */
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
    project: text("project").notNull(),
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

export const userRelations = relations(user, ({ many }) => ({
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
}));

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                            */
/* -------------------------------------------------------------------------- */

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type UserStatus = (typeof userStatus.enumValues)[number];

export type Client = typeof client.$inferSelect;
export type Position = typeof position.$inferSelect;
export type Level = typeof level.$inferSelect;
export type Gender = typeof gender.$inferSelect;
export type Team = typeof team.$inferSelect;

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
