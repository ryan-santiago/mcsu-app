import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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

/**
 * The only two lookup kinds that carry an email — for future notifications
 * (e.g. contract renewal alerts). Everything else about them still goes
 * through the same generic Maintenance CRUD as every other lookup; only
 * `src/server/maintenance/actions.ts`'s create/update branch on `email`.
 */
export const salesRepresentative = pgTable(
  "sales_representative",
  () => ({ ...lookupColumns(), email: text("email") }),
  (table) => [uniqueIndex("sales_representative_name_idx").on(table.name)],
);

export const solutionsManager = pgTable(
  "solutions_manager",
  () => ({ ...lookupColumns(), email: text("email") }),
  (table) => [uniqueIndex("solutions_manager_name_idx").on(table.name)],
);

export const engagementType = pgTable("engagement_type", lookupColumns, (table) => [
  uniqueIndex("engagement_type_name_idx").on(table.name),
]);

/** Where a Talent Acquisition candidate was sourced from — LinkedIn, Indeed, referral, etc. */
export const jobPostingSource = pgTable("job_posting_source", lookupColumns, (table) => [
  uniqueIndex("job_posting_source_name_idx").on(table.name),
]);

/**
 * A job description/qualification pinned to one Position × Level combination
 * — e.g. "Software Developer" + "Junior" reads very differently from
 * "Software Developer" + "Mid". Deliberately its own table rather than
 * columns on `position` or `level`: neither lookup alone can express the
 * combination, and not every combination needs a profile (no "Junior HR
 * Manager"), so this has to be a sparse list an admin opts into rather than a
 * full cross-product.
 *
 * `positionId`/`levelId` reference the same lookup rows `employeeEmployment`
 * already uses — this table doesn't touch that assignment path at all, it
 * only adds richer content keyed off the same two lookups. Intended as the
 * anchor for the future Talent Acquisition module (a requisition references
 * a Job Profile for its description/qualifications).
 */
export const jobProfile = pgTable(
  "job_profile",
  {
    id: text("id").primaryKey(),
    positionId: text("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "restrict" }),
    levelId: text("level_id")
      .notNull()
      .references(() => level.id, { onDelete: "restrict" }),
    /** Sanitized HTML from the shared rich text editor — see `sanitizeDescriptionHtml()`. */
    jobDescription: text("job_description"),
    jobQualification: text("job_qualification"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("job_profile_position_level_idx").on(table.positionId, table.levelId)],
);

/* -------------------------------------------------------------------------- */
/*  Talent Acquisition                                                        */
/* -------------------------------------------------------------------------- */

export const workSetup = pgEnum("work_setup", ["onsite", "hybrid", "remote"]);
export const taRequestStatus = pgEnum("ta_request_status", [
  "pending_approval",
  "open",
  "partially_filled",
  "filled",
  "cancelled",
]);
export const taApplicationStatus = pgEnum("ta_application_status", [
  "active",
  "hired",
  "rejected",
  "withdrawn",
]);
/** `client_interview` only applies when `taApplication.clientInterviewRequired` is set. */
export const taStage = pgEnum("ta_stage", [
  "l1_assessment",
  "l2_assessment",
  "client_interview",
  "final_interview",
  "job_offer",
]);
export const taStageStatus = pgEnum("ta_stage_status", [
  "pending",
  "in_progress",
  "passed",
  "failed",
  "skipped",
]);
export const taScorecardRating = pgEnum("ta_scorecard_rating", ["strong_yes", "yes", "no", "strong_no"]);

/**
 * A Manager's headcount request — Position/Level comes from a `jobProfile`
 * (never duplicated here as raw `positionId`/`levelId`), so the request
 * carries whatever job description/qualification the profile already has.
 * Starts `pending_approval`; a Dept Head/Unit Manager must approve it
 * (`approvedBy`/`approvedAt`) before it becomes sourceable.
 */
export const taRequest = pgTable(
  "ta_request",
  {
    id: text("id").primaryKey(),
    jobProfileId: text("job_profile_id")
      .notNull()
      .references(() => jobProfile.id, { onDelete: "restrict" }),
    clientId: text("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    headcountNeeded: integer("headcount_needed").notNull(),
    workSetup: workSetup("work_setup").notNull(),
    /** Onsite location, or a description of the hybrid schedule. Null for fully remote. */
    workSetupDetail: text("work_setup_detail"),
    status: taRequestStatus("status").notNull().default("pending_approval"),
    notes: text("notes"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** Rejection reason when a pending request is declined, or an optional approval note. */
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
    index("ta_request_job_profile_idx").on(table.jobProfileId),
    index("ta_request_client_idx").on(table.clientId),
  ],
);

/**
 * The durable person record — a talent pool entry independent of any single
 * request. Deliberately a *lighter* profile than `employee` — full addresses,
 * government IDs, salary and employment type stay Employee-only, captured at
 * migration time (`migrateCandidateToEmployee`) rather than duplicated here.
 * `employeeId` lives here (not on `taApplication`) since "already hired" is a
 * person-level fact true regardless of which application converted them.
 */
export const taCandidate = pgTable(
  "ta_candidate",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    genderId: text("gender_id").references(() => gender.id, { onDelete: "set null" }),
    mobileNumber: text("mobile_number"),
    personalEmail: text("personal_email"),
    /** One CV on file — reuses the One-Lot Project Docs storage mechanism, see `src/lib/document-storage.ts`. */
    cvStorageKey: text("cv_storage_key"),
    cvFileName: text("cv_file_name"),
    cvMimeType: text("cv_mime_type"),
    cvSize: integer("cv_size"),
    /** Set once migrated — the candidate row is kept for history, not deleted. */
    employeeId: text("employee_id").references(() => employee.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("ta_candidate_employee_idx").on(table.employeeId)],
);

/**
 * One person's pursuit of one request — the join between the talent pool and
 * a requisition. A candidate can have many applications over time (rejected
 * for one request, later hired via another). Only one *active* application
 * per candidate/request pair is allowed (partial unique index below); a
 * rejected-then-reapplied history is fine.
 */
export const taApplication = pgTable(
  "ta_application",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => taCandidate.id, { onDelete: "cascade" }),
    requestId: text("request_id")
      .notNull()
      .references(() => taRequest.id, { onDelete: "cascade" }),
    sourceId: text("source_id").references(() => jobPostingSource.id, { onDelete: "set null" }),
    status: taApplicationStatus("status").notNull().default("active"),
    /** Why rejected/withdrawn — set alongside `status`/`statusChangedAt`/`statusChangedBy`. */
    statusReason: text("status_reason"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    statusChangedBy: text("status_changed_by").references(() => user.id, { onDelete: "set null" }),
    /** The board column this application currently sits in — written directly on move, not derived from stage rows. */
    currentStage: taStage("current_stage").notNull().default("l1_assessment"),
    /** Set by the L2 assignee when completing L2 Assessment — an explicit toggle rather than implicitly skipping the stage. */
    clientInterviewRequired: boolean("client_interview_required").notNull().default(false),
    targetOnboardDate: date("target_onboard_date"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ta_application_candidate_idx").on(table.candidateId),
    index("ta_application_request_idx").on(table.requestId),
    uniqueIndex("ta_application_one_active_idx")
      .on(table.candidateId, table.requestId)
      .where(sql`${table.status} = 'active'`),
  ],
);

/**
 * One row per applicable stage per application, created lazily as the
 * pipeline advances — not all five upfront, since `client_interview` may
 * never apply. Stages are not gated on the previous one having passed — an
 * application can be moved to any stage, or rejected/withdrawn, at any point.
 * `assigneeId` is enforced (actor must match) only for `l2_assessment` and
 * `client_interview` in the action layer; informational only for the rest.
 */
export const taApplicationStage = pgTable(
  "ta_application_stage",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => taApplication.id, { onDelete: "cascade" }),
    stage: taStage("stage").notNull(),
    status: taStageStatus("status").notNull().default("pending"),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ta_application_stage_application_idx").on(table.applicationId),
    uniqueIndex("ta_application_stage_application_stage_idx").on(table.applicationId, table.stage),
  ],
);

/**
 * Structured per-evaluator feedback on a stage — independent of the stage's
 * own `status`/`notes`, which stay the "official" line set by whoever holds
 * that stage's tier permission. Re-scoring updates the existing row.
 */
export const taCandidateScorecard = pgTable(
  "ta_candidate_scorecard",
  {
    id: text("id").primaryKey(),
    applicationStageId: text("application_stage_id")
      .notNull()
      .references(() => taApplicationStage.id, { onDelete: "cascade" }),
    evaluatorId: text("evaluator_id").references(() => user.id, { onDelete: "set null" }),
    rating: taScorecardRating("rating").notNull(),
    comments: text("comments"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ta_candidate_scorecard_application_stage_idx").on(table.applicationStageId),
    uniqueIndex("ta_candidate_scorecard_stage_evaluator_idx").on(table.applicationStageId, table.evaluatorId),
  ],
);

/** Flat comment list, person-scoped (not per-application) — verbatim port of `oneLotProjectWorkItemComment`'s shape. */
export const taCandidateComment = pgTable(
  "ta_candidate_comment",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => taCandidate.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("ta_candidate_comment_candidate_idx").on(table.candidateId)],
);

/* -------------------------------------------------------------------------- */
/*  Notifications                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Per-viewer read markers for the header notification bell.
 *
 * Notifications themselves are never stored — they're computed on read from
 * each source module's own live data (e.g. a pending `user` row), the same
 * way the bell's badge count is just a query, not a materialized feed. This
 * table only remembers whether a given viewer has already seen a given
 * source row, so a resolved item (e.g. a user that gets approved/rejected)
 * disappears from the feed on its own — nothing to clean up here.
 *
 * `module` namespaces `entityId` the same way `audit_log.module` does, so
 * future notification sources (Talent Acquisition approvals, etc.) reuse
 * this table without a schema change — see AGENTS.md's note on this feature
 * starting out scoped to User Management only.
 */
export const notificationRead = pgTable(
  "notification_read",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    entityId: text("entity_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("notification_read_user_module_entity_idx").on(table.userId, table.module, table.entityId),
  ],
);

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
    reasonForLeaving: text("reason_for_leaving"),
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
/*  Engagement — Staff Augmentation & One-Lot Project                        */
/* -------------------------------------------------------------------------- */

/**
 * Visibility is pure RBAC (`staff_augmentation:read`), no membership scoping,
 * unlike One-Lot Project below. Employee-level staffing lives on
 * `staffAugmentationAssignment`.
 */
export const staffAugmentationEngagement = pgTable(
  "staff_augmentation_engagement",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("staff_augmentation_engagement_name_idx").on(table.name)],
);

/**
 * Who's staffed on an engagement — a pure link, styled like
 * `oneLotProjectMember`. Level/Position, Project and dates are never stored
 * here: the sidebar/table always reads them live from the employee's current
 * `employeeEmployment` row and latest `employeeDeployment` row (see
 * `latestEmploymentSubquery`/`latestDeploymentSubquery` in
 * `src/server/employees/queries.ts`), so this table never drifts from the
 * Employee module's own record of the same person.
 */
export const staffAugmentationAssignment = pgTable(
  "staff_augmentation_assignment",
  {
    id: text("id").primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => staffAugmentationEngagement.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("staff_augmentation_assignment_engagement_employee_idx").on(
      table.engagementId,
      table.employeeId,
    ),
  ],
);

/**
 * Parent record for a JIRA-style project (Summary/Backlog/Kanban/Calendar).
 * Visibility — of both the project and its content — comes from either of
 * two independent paths: holding `one_lot_projects:read` (sees and monitors
 * every project), or being the creator or a member via `oneLotProjectMember`
 * (sees just that project, even with no module permission at all) — see
 * `hasUnrestrictedAccess` for the admin bypass and
 * `src/server/one-lot-projects/queries.ts`'s `contentVisibilityWhere`.
 */
export const oneLotProject = pgTable(
  "one_lot_project",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Counter for Backlog-scoped work item codes ("Backlog-001", ...) — see `oneLotProjectWorkItem.code`. */
    nextBacklogItemNumber: integer("next_backlog_item_number").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("one_lot_project_name_idx").on(table.name)],
);

/**
 * Who can see/work in a One-Lot project beyond its creator — picked from
 * User Management accounts, not Employees (the two are only loosely linked
 * by email match, see `getCurrentUser` in `src/lib/session.ts`).
 */
export const oneLotProjectMember = pgTable(
  "one_lot_project_member",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => oneLotProject.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("one_lot_project_member_project_user_idx").on(table.projectId, table.userId)],
);

/** Which S3P (Projects-module) records a One-Lot project spans — a pure link, styled like `oneLotProjectMember`/`staffAugmentationAssignment`. */
export const oneLotProjectS3pProject = pgTable(
  "one_lot_project_s3p_project",
  {
    id: text("id").primaryKey(),
    oneLotProjectId: text("one_lot_project_id")
      .notNull()
      .references(() => oneLotProject.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("one_lot_project_s3p_project_one_lot_project_id_project_id_idx").on(
      table.oneLotProjectId,
      table.projectId,
    ),
  ],
);

export const workItemType = pgEnum("work_item_type", ["task", "bug", "subtask"]);
export const workItemPriority = pgEnum("work_item_priority", ["highest", "high", "medium", "low", "lowest"]);
export const sprintStatus = pgEnum("sprint_status", ["planned", "active", "completed"]);

/**
 * A sprint always starts `planned`; `startOneLotProjectSprint` moves it to
 * `active` (only one active sprint per project — enforced by the partial
 * unique index below, not just the app-layer pre-check, since there's no
 * `db.transaction()` on the Neon HTTP driver); `completeOneLotProjectSprint`
 * moves it to `completed` and migrates its unfinished items back to the
 * Backlog. `itemCode` is the prefix ("SCRUM") used for this sprint's own
 * item codes — editing it later doesn't retroactively change codes already
 * generated, since those are stored as literal strings on the item row.
 */
export const oneLotProjectSprint = pgTable(
  "one_lot_project_sprint",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => oneLotProject.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    itemCode: text("item_code").notNull(),
    /** Nullable — a sprint can be created before its dates are known, but `startOneLotProjectSprint` requires both before the "planned → active" transition. */
    startDate: date("start_date"),
    endDate: date("end_date"),
    goal: text("goal"),
    status: sprintStatus("status").notNull().default("planned"),
    /** Counter for this sprint's own item codes ("{itemCode}-1", "{itemCode}-2", ...). */
    nextItemNumber: integer("next_item_number").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("one_lot_project_sprint_project_idx").on(table.projectId),
    uniqueIndex("one_lot_project_sprint_one_active_idx")
      .on(table.projectId)
      .where(sql`${table.status} = 'active'`),
  ],
);

/**
 * A per-project, user-configurable Kanban column — replaces a fixed status
 * enum so "+ Add column" (Kanban Board) can create arbitrary ones. Every
 * project is seeded with four (To Do/In Progress/In Review/Done) at
 * creation. `isDefault` is where a new work item lands; `isDone` is what
 * `completeOneLotProjectSprint` treats as finished when migrating
 * unfinished items back to the Backlog — both enforced as at-most-one-per-
 * project by the partial unique indexes below.
 */
export const oneLotProjectBoardColumn = pgTable(
  "one_lot_project_board_column",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => oneLotProject.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    isDone: boolean("is_done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("one_lot_project_board_column_project_idx").on(table.projectId),
    uniqueIndex("one_lot_project_board_column_one_default_idx")
      .on(table.projectId)
      .where(sql`${table.isDefault} = true`),
    uniqueIndex("one_lot_project_board_column_one_done_idx")
      .on(table.projectId)
      .where(sql`${table.isDone} = true`),
  ],
);

/**
 * A top-level Task/Bug (`parentId` null) or a Subtask (`parentId` set,
 * `type` always `"subtask"`, and always parented to a Task — never a Bug).
 * Same row shape either way; `code` is generated once (see
 * `createOneLotProjectWorkItem`'s counter step) and never changes —
 * permanent even if the item later moves between Backlog and a Sprint
 * (`sprintId` is the only thing that changes then).
 */
export const oneLotProjectWorkItem = pgTable(
  "one_lot_project_work_item",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => oneLotProject.id, { onDelete: "cascade" }),
    /** Null = Backlog. */
    sprintId: text("sprint_id").references(() => oneLotProjectSprint.id, { onDelete: "set null" }),
    /** Null = top-level item; set = subtask, always parented to a top-level item. */
    parentId: text("parent_id").references((): AnyPgColumn => oneLotProjectWorkItem.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    type: workItemType("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    columnId: text("column_id")
      .notNull()
      .references(() => oneLotProjectBoardColumn.id, { onDelete: "restrict" }),
    priority: workItemPriority("priority").notNull().default("medium"),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    /** Solid color token for the card's header strip — Task/Bug only, picked from a fixed palette, see `WORK_ITEM_COVER_COLORS`. */
    coverColor: text("cover_color"),
    dueDate: date("due_date"),
    /** 1 story point ≈ 2 hours (a team convention, not enforced here). */
    storyPoints: numeric("story_points", { precision: 5, scale: 1 }),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Position within its Kanban column — independent of `sortOrder`, which positions it within its Backlog/Sprint bucket (an orthogonal grouping). */
    boardSortOrder: integer("board_sort_order").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("one_lot_project_work_item_project_idx").on(table.projectId),
    index("one_lot_project_work_item_sprint_idx").on(table.sprintId),
    index("one_lot_project_work_item_parent_idx").on(table.parentId),
    index("one_lot_project_work_item_assignee_idx").on(table.assigneeId),
    index("one_lot_project_work_item_board_idx").on(table.projectId, table.sprintId, table.sortOrder),
    uniqueIndex("one_lot_project_work_item_project_code_idx").on(table.projectId, table.code),
  ],
);

export const oneLotProjectWorkItemComment = pgTable(
  "one_lot_project_work_item_comment",
  {
    id: text("id").primaryKey(),
    workItemId: text("work_item_id")
      .notNull()
      .references(() => oneLotProjectWorkItem.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("one_lot_project_work_item_comment_work_item_idx").on(table.workItemId)],
);

export const oneLotProjectDocumentType = pgEnum("one_lot_project_document_type", ["folder", "file"]);

/* -------------------------------------------------------------------------- */
/*  Announcements                                                             */
/* -------------------------------------------------------------------------- */

export const announcementType = pgEnum("announcement_type", ["news", "activity"]);

export const announcement = pgTable(
  "announcement",
  {
    id: text("id").primaryKey(),
    announcementDate: date("announcement_date").notNull(),
    type: announcementType("type").notNull(),
    title: text("title").notNull(),
    /** Sanitized HTML from the shared rich text editor — see `sanitizeDescriptionHtml()`. */
    description: text("description"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("announcement_date_idx").on(table.announcementDate),
    index("announcement_type_idx").on(table.type),
  ],
);

/**
 * A file-explorer-style document tree per project — folders and files in one
 * self-referencing table, the same `parentId` convention
 * `oneLotProjectWorkItem` uses for subtasks. Files are metadata only: bytes
 * live on local disk under a storage root outside `public/` (see
 * `src/lib/document-storage.ts` — deliberately not Next.js's statically
 * served `public/` directory, so a document is never reachable without
 * going through the authenticated download route handler first), keyed by
 * `storageKey` — a relative path shaped like
 * `Documents/One-Lot Project/{projectId}/documents/…` to match where this
 * is planned to migrate under SharePoint later, see `docs/DOCUMENTS.md`.
 *
 * Local disk only works against a persistent filesystem (self-hosted, EC2)
 * — never against this app's current Vercel deployment, whose serverless
 * functions don't persist local writes between requests. See
 * `isDocumentStorageAvailable()`, which every read/write path checks first.
 *
 * Name-uniqueness within a folder is enforced at the application layer
 * (query-then-insert, same convention as sprint item codes in
 * `backlog-actions.ts`'s `assertItemCodeAvailable`) rather than a DB unique
 * index — Postgres treats every `parentId IS NULL` row as distinct from every
 * other, so a plain `(projectId, parentId, name)` index wouldn't catch
 * duplicate names at the document root anyway.
 */
export const oneLotProjectDocument = pgTable(
  "one_lot_project_document",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => oneLotProject.id, { onDelete: "cascade" }),
    /** Null = lives at the project's document root. */
    parentId: text("parent_id").references((): AnyPgColumn => oneLotProjectDocument.id, { onDelete: "cascade" }),
    type: oneLotProjectDocumentType("type").notNull(),
    name: text("name").notNull(),
    /** Null for folders. Relative path under the document storage root — never returned to the client directly; see the authenticated download route handler. */
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    /** Bytes. Null for folders. */
    size: integer("size"),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("one_lot_project_document_project_idx").on(table.projectId),
    index("one_lot_project_document_parent_idx").on(table.parentId),
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

export const oneLotProjectRelations = relations(oneLotProject, ({ many }) => ({
  members: many(oneLotProjectMember),
  s3pProjects: many(oneLotProjectS3pProject),
  sprints: many(oneLotProjectSprint),
  workItems: many(oneLotProjectWorkItem),
  boardColumns: many(oneLotProjectBoardColumn),
}));

export const oneLotProjectMemberRelations = relations(oneLotProjectMember, ({ one }) => ({
  project: one(oneLotProject, { fields: [oneLotProjectMember.projectId], references: [oneLotProject.id] }),
  user: one(user, { fields: [oneLotProjectMember.userId], references: [user.id] }),
}));

export const oneLotProjectS3pProjectRelations = relations(oneLotProjectS3pProject, ({ one }) => ({
  oneLotProject: one(oneLotProject, {
    fields: [oneLotProjectS3pProject.oneLotProjectId],
    references: [oneLotProject.id],
  }),
  project: one(project, { fields: [oneLotProjectS3pProject.projectId], references: [project.id] }),
}));

export const oneLotProjectSprintRelations = relations(oneLotProjectSprint, ({ one, many }) => ({
  project: one(oneLotProject, { fields: [oneLotProjectSprint.projectId], references: [oneLotProject.id] }),
  items: many(oneLotProjectWorkItem),
}));

export const oneLotProjectBoardColumnRelations = relations(oneLotProjectBoardColumn, ({ one, many }) => ({
  project: one(oneLotProject, { fields: [oneLotProjectBoardColumn.projectId], references: [oneLotProject.id] }),
  items: many(oneLotProjectWorkItem),
}));

export const oneLotProjectWorkItemRelations = relations(oneLotProjectWorkItem, ({ one, many }) => ({
  project: one(oneLotProject, { fields: [oneLotProjectWorkItem.projectId], references: [oneLotProject.id] }),
  sprint: one(oneLotProjectSprint, { fields: [oneLotProjectWorkItem.sprintId], references: [oneLotProjectSprint.id] }),
  column: one(oneLotProjectBoardColumn, {
    fields: [oneLotProjectWorkItem.columnId],
    references: [oneLotProjectBoardColumn.id],
  }),
  parent: one(oneLotProjectWorkItem, {
    fields: [oneLotProjectWorkItem.parentId],
    references: [oneLotProjectWorkItem.id],
    relationName: "subtasks",
  }),
  subtasks: many(oneLotProjectWorkItem, { relationName: "subtasks" }),
  assignee: one(user, { fields: [oneLotProjectWorkItem.assigneeId], references: [user.id] }),
  comments: many(oneLotProjectWorkItemComment),
}));

export const oneLotProjectWorkItemCommentRelations = relations(oneLotProjectWorkItemComment, ({ one }) => ({
  workItem: one(oneLotProjectWorkItem, {
    fields: [oneLotProjectWorkItemComment.workItemId],
    references: [oneLotProjectWorkItem.id],
  }),
  author: one(user, { fields: [oneLotProjectWorkItemComment.authorId], references: [user.id] }),
}));

export const staffAugmentationEngagementRelations = relations(staffAugmentationEngagement, ({ many }) => ({
  assignments: many(staffAugmentationAssignment),
}));

export const staffAugmentationAssignmentRelations = relations(staffAugmentationAssignment, ({ one }) => ({
  engagement: one(staffAugmentationEngagement, {
    fields: [staffAugmentationAssignment.engagementId],
    references: [staffAugmentationEngagement.id],
  }),
  employee: one(employee, { fields: [staffAugmentationAssignment.employeeId], references: [employee.id] }),
}));

export const announcementRelations = relations(announcement, ({ one }) => ({
  author: one(user, { fields: [announcement.createdBy], references: [user.id] }),
}));

export const jobProfileRelations = relations(jobProfile, ({ one }) => ({
  position: one(position, { fields: [jobProfile.positionId], references: [position.id] }),
  level: one(level, { fields: [jobProfile.levelId], references: [level.id] }),
  author: one(user, { fields: [jobProfile.createdBy], references: [user.id] }),
}));

export const taRequestRelations = relations(taRequest, ({ one, many }) => ({
  jobProfile: one(jobProfile, { fields: [taRequest.jobProfileId], references: [jobProfile.id] }),
  client: one(client, { fields: [taRequest.clientId], references: [client.id] }),
  requester: one(user, { fields: [taRequest.requestedBy], references: [user.id] }),
  approver: one(user, { fields: [taRequest.approvedBy], references: [user.id] }),
  applications: many(taApplication),
}));

export const taCandidateRelations = relations(taCandidate, ({ one, many }) => ({
  gender: one(gender, { fields: [taCandidate.genderId], references: [gender.id] }),
  employee: one(employee, { fields: [taCandidate.employeeId], references: [employee.id] }),
  author: one(user, { fields: [taCandidate.createdBy], references: [user.id] }),
  applications: many(taApplication),
  comments: many(taCandidateComment),
}));

export const taApplicationRelations = relations(taApplication, ({ one, many }) => ({
  candidate: one(taCandidate, { fields: [taApplication.candidateId], references: [taCandidate.id] }),
  request: one(taRequest, { fields: [taApplication.requestId], references: [taRequest.id] }),
  source: one(jobPostingSource, { fields: [taApplication.sourceId], references: [jobPostingSource.id] }),
  statusChangedByUser: one(user, { fields: [taApplication.statusChangedBy], references: [user.id] }),
  author: one(user, { fields: [taApplication.createdBy], references: [user.id] }),
  stages: many(taApplicationStage),
}));

export const taApplicationStageRelations = relations(taApplicationStage, ({ one, many }) => ({
  application: one(taApplication, { fields: [taApplicationStage.applicationId], references: [taApplication.id] }),
  assignee: one(user, { fields: [taApplicationStage.assigneeId], references: [user.id] }),
  scorecards: many(taCandidateScorecard),
}));

export const taCandidateScorecardRelations = relations(taCandidateScorecard, ({ one }) => ({
  applicationStage: one(taApplicationStage, {
    fields: [taCandidateScorecard.applicationStageId],
    references: [taApplicationStage.id],
  }),
  evaluator: one(user, { fields: [taCandidateScorecard.evaluatorId], references: [user.id] }),
}));

export const taCandidateCommentRelations = relations(taCandidateComment, ({ one }) => ({
  candidate: one(taCandidate, { fields: [taCandidateComment.candidateId], references: [taCandidate.id] }),
  author: one(user, { fields: [taCandidateComment.authorId], references: [user.id] }),
}));

export const notificationReadRelations = relations(notificationRead, ({ one }) => ({
  user: one(user, { fields: [notificationRead.userId], references: [user.id] }),
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

export type StaffAugmentationEngagement = typeof staffAugmentationEngagement.$inferSelect;
export type NewStaffAugmentationEngagement = typeof staffAugmentationEngagement.$inferInsert;
export type StaffAugmentationAssignment = typeof staffAugmentationAssignment.$inferSelect;
export type NewStaffAugmentationAssignment = typeof staffAugmentationAssignment.$inferInsert;

export type OneLotProject = typeof oneLotProject.$inferSelect;
export type NewOneLotProject = typeof oneLotProject.$inferInsert;
export type OneLotProjectMember = typeof oneLotProjectMember.$inferSelect;
export type NewOneLotProjectMember = typeof oneLotProjectMember.$inferInsert;
export type OneLotProjectS3pProject = typeof oneLotProjectS3pProject.$inferSelect;
export type NewOneLotProjectS3pProject = typeof oneLotProjectS3pProject.$inferInsert;
export type OneLotProjectSprint = typeof oneLotProjectSprint.$inferSelect;
export type NewOneLotProjectSprint = typeof oneLotProjectSprint.$inferInsert;
export type SprintStatus = (typeof sprintStatus.enumValues)[number];
export type OneLotProjectWorkItem = typeof oneLotProjectWorkItem.$inferSelect;
export type NewOneLotProjectWorkItem = typeof oneLotProjectWorkItem.$inferInsert;
export type WorkItemType = (typeof workItemType.enumValues)[number];
export type WorkItemPriority = (typeof workItemPriority.enumValues)[number];
export type OneLotProjectWorkItemComment = typeof oneLotProjectWorkItemComment.$inferSelect;
export type NewOneLotProjectWorkItemComment = typeof oneLotProjectWorkItemComment.$inferInsert;
export type OneLotProjectBoardColumn = typeof oneLotProjectBoardColumn.$inferSelect;
export type NewOneLotProjectBoardColumn = typeof oneLotProjectBoardColumn.$inferInsert;
export type OneLotProjectDocument = typeof oneLotProjectDocument.$inferSelect;
export type NewOneLotProjectDocument = typeof oneLotProjectDocument.$inferInsert;
export type OneLotProjectDocumentType = (typeof oneLotProjectDocumentType.enumValues)[number];

export type Announcement = typeof announcement.$inferSelect;
export type NewAnnouncement = typeof announcement.$inferInsert;
export type AnnouncementType = (typeof announcementType.enumValues)[number];

export type JobProfile = typeof jobProfile.$inferSelect;
export type NewJobProfile = typeof jobProfile.$inferInsert;

export type JobPostingSource = typeof jobPostingSource.$inferSelect;

export type WorkSetup = (typeof workSetup.enumValues)[number];
export type TaRequest = typeof taRequest.$inferSelect;
export type NewTaRequest = typeof taRequest.$inferInsert;
export type TaRequestStatus = (typeof taRequestStatus.enumValues)[number];
export type TaCandidate = typeof taCandidate.$inferSelect;
export type NewTaCandidate = typeof taCandidate.$inferInsert;
export type TaApplication = typeof taApplication.$inferSelect;
export type NewTaApplication = typeof taApplication.$inferInsert;
export type TaApplicationStatus = (typeof taApplicationStatus.enumValues)[number];
export type TaApplicationStage = typeof taApplicationStage.$inferSelect;
export type NewTaApplicationStage = typeof taApplicationStage.$inferInsert;
export type TaStage = (typeof taStage.enumValues)[number];
export type TaStageStatus = (typeof taStageStatus.enumValues)[number];
export type TaCandidateComment = typeof taCandidateComment.$inferSelect;
export type NewTaCandidateComment = typeof taCandidateComment.$inferInsert;
export type TaCandidateScorecard = typeof taCandidateScorecard.$inferSelect;
export type NewTaCandidateScorecard = typeof taCandidateScorecard.$inferInsert;
export type TaScorecardRating = (typeof taScorecardRating.enumValues)[number];
