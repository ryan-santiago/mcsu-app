/**
 * Replays the snapshot from `npm run db:backup`
 * (scripts/seed-data/production-seed.json) into whatever database
 * DATABASE_URL currently points at.
 *
 * Run once against Production: after `npm run db:migrate` there, before
 * anyone signs in. Point .env.local (or DATABASE_URL inline) at the
 * production database first — see docs/SETUP.md.
 *
 * Audit Trail and Approvals are deliberately not in the snapshot (see
 * backup-data.ts) — Production starts with an empty audit log and no
 * pending change requests.
 *
 * Every user account is created with PRODUCTION_PASSWORD below rather than
 * whatever hash existed wherever the snapshot was taken from — accounts are
 * created through BetterAuth so the stored hash always matches whatever
 * algorithm the running version expects, same convention as scripts/seed.ts.
 *
 * Insert order follows the schema's foreign keys (roles before users,
 * lookups before the projects/employees that reference them, ...). Every
 * table is inserted with `onConflictDoNothing` on its original id, and users
 * are matched by email — re-running against a partially-seeded database is
 * safe.
 *
 *   npm run db:seed:production
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { eq as eqType } from "drizzle-orm";

import type { db as dbClient } from "../src/db";
import type * as schemaType from "../src/db/schema";
import type { auth as authClient } from "../src/lib/auth";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const INPUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "seed-data", "production-seed.json");

/** Every seeded account gets this password — change it after first sign-in per user. */
const PRODUCTION_PASSWORD = "Questronix@2026";

type JsonRow = Record<string, unknown>;

interface SeedSnapshot {
  exportedAt: string;
  role: JsonRow[];
  user: JsonRow[];
  gender: JsonRow[];
  client: JsonRow[];
  position: JsonRow[];
  level: JsonRow[];
  employmentType: JsonRow[];
  team: JsonRow[];
  salesRepresentative: JsonRow[];
  solutionsManager: JsonRow[];
  engagementType: JsonRow[];
  project: JsonRow[];
  projectClientName: JsonRow[];
  projectDetail: JsonRow[];
  projectDetailTeam: JsonRow[];
  employee: JsonRow[];
  employeeAddress: JsonRow[];
  employeeEmployment: JsonRow[];
  employeeDeployment: JsonRow[];
}

let eq: typeof eqType;
let db: typeof dbClient;
let schema: typeof schemaType;
let auth: typeof authClient;

/** JSON round-tripping turns every timestamp into a string; fields named `*At` are the only ones that need reviving back to a Date for Drizzle. */
function reviveDates(rows: JsonRow[]): JsonRow[] {
  return rows.map((row) => {
    const revived: JsonRow = { ...row };
    for (const key of Object.keys(revived)) {
      const value = revived[key];
      if (key.endsWith("At") && typeof value === "string") {
        revived[key] = new Date(value);
      }
    }
    return revived;
  });
}

function report(label: string, count: number) {
  console.log(`  ${label.padEnd(22)} ${count}`);
}

async function seedRoles(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.role.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.role).values(values).onConflictDoNothing({ target: schema.role.id });
  report("role", values.length);
}

async function seedGenders(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.gender.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.gender).values(values).onConflictDoNothing({ target: schema.gender.id });
  report("gender", values.length);
}

async function seedClients(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.client.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.client).values(values).onConflictDoNothing({ target: schema.client.id });
  report("client", values.length);
}

async function seedPositions(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.position.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.position).values(values).onConflictDoNothing({ target: schema.position.id });
  report("position", values.length);
}

async function seedLevels(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.level.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.level).values(values).onConflictDoNothing({ target: schema.level.id });
  report("level", values.length);
}

async function seedEmploymentTypes(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.employmentType.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.employmentType).values(values).onConflictDoNothing({ target: schema.employmentType.id });
  report("employmentType", values.length);
}

async function seedTeams(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.team.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.team).values(values).onConflictDoNothing({ target: schema.team.id });
  report("team", values.length);
}

async function seedSalesRepresentatives(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.salesRepresentative.$inferInsert)[];
  if (!values.length) return;
  await db
    .insert(schema.salesRepresentative)
    .values(values)
    .onConflictDoNothing({ target: schema.salesRepresentative.id });
  report("salesRepresentative", values.length);
}

async function seedSolutionsManagers(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.solutionsManager.$inferInsert)[];
  if (!values.length) return;
  await db
    .insert(schema.solutionsManager)
    .values(values)
    .onConflictDoNothing({ target: schema.solutionsManager.id });
  report("solutionsManager", values.length);
}

async function seedEngagementTypes(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.engagementType.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.engagementType).values(values).onConflictDoNothing({ target: schema.engagementType.id });
  report("engagementType", values.length);
}

async function seedProjects(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.project.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.project).values(values).onConflictDoNothing({ target: schema.project.id });
  report("project", values.length);
}

async function seedProjectClientNames(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.projectClientName.$inferInsert)[];
  if (!values.length) return;
  await db
    .insert(schema.projectClientName)
    .values(values)
    .onConflictDoNothing({ target: schema.projectClientName.id });
  report("projectClientName", values.length);
}

async function seedProjectDetails(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.projectDetail.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.projectDetail).values(values).onConflictDoNothing({ target: schema.projectDetail.id });
  report("projectDetail", values.length);
}

async function seedProjectDetailTeams(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.projectDetailTeam.$inferInsert)[];
  if (!values.length) return;
  await db
    .insert(schema.projectDetailTeam)
    .values(values)
    .onConflictDoNothing({ target: schema.projectDetailTeam.id });
  report("projectDetailTeam", values.length);
}

async function seedEmployees(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.employee.$inferInsert)[];
  if (!values.length) return;
  await db.insert(schema.employee).values(values).onConflictDoNothing({ target: schema.employee.id });
  report("employee", values.length);
}

async function seedEmployeeAddresses(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.employeeAddress.$inferInsert)[];
  if (!values.length) return;
  await db
    .insert(schema.employeeAddress)
    .values(values)
    .onConflictDoNothing({ target: schema.employeeAddress.id });
  report("employeeAddress", values.length);
}

async function seedEmployeeEmployments(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.employeeEmployment.$inferInsert)[];
  if (!values.length) return;
  await db
    .insert(schema.employeeEmployment)
    .values(values)
    .onConflictDoNothing({ target: schema.employeeEmployment.id });
  report("employeeEmployment", values.length);
}

async function seedEmployeeDeployments(rows: JsonRow[]) {
  const values = reviveDates(rows) as (typeof schema.employeeDeployment.$inferInsert)[];
  if (!values.length) return;
  await db
    .insert(schema.employeeDeployment)
    .values(values)
    .onConflictDoNothing({ target: schema.employeeDeployment.id });
  report("employeeDeployment", values.length);
}

/**
 * Creates the credential account through BetterAuth (same reasoning as
 * scripts/seed.ts) with the fixed production password, then restores the
 * role/status/approval fields from the snapshot.
 */
async function seedUsers(rows: JsonRow[]) {
  let created = 0;
  for (const row of rows) {
    const email = row.email as string;
    const [existing] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);
    if (existing) continue;

    await auth.api.signUpEmail({
      body: { name: row.name as string, email, password: PRODUCTION_PASSWORD },
    });

    await db
      .update(schema.user)
      .set({
        roleId: row.roleId as string,
        status: row.status as schemaType.UserStatus,
        approvedAt: row.approvedAt ? new Date(row.approvedAt as string) : null,
        approvedBy: (row.approvedBy as string | null) ?? null,
        lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt as string) : null,
        emailVerified: (row.emailVerified as boolean) ?? false,
        image: (row.image as string | null) ?? null,
      })
      .where(eq(schema.user.email, email));

    created++;
  }
  console.log(`  user                   ${created} created, ${rows.length - created} already present`);
}

async function main() {
  ({ eq } = await import("drizzle-orm"));
  ({ db } = await import("../src/db"));
  schema = await import("../src/db/schema");
  ({ auth } = await import("../src/lib/auth"));

  const snapshot = JSON.parse(readFileSync(INPUT_PATH, "utf-8")) as SeedSnapshot;

  console.log(`\nSeeding Production from snapshot exported ${snapshot.exportedAt}\n`);

  console.log("Roles:");
  await seedRoles(snapshot.role);

  console.log(`\nUsers  (password: ${PRODUCTION_PASSWORD})`);
  await seedUsers(snapshot.user);

  console.log("\nMaintenance lookups:");
  await seedGenders(snapshot.gender);
  await seedClients(snapshot.client);
  await seedPositions(snapshot.position);
  await seedLevels(snapshot.level);
  await seedEmploymentTypes(snapshot.employmentType);
  await seedTeams(snapshot.team);
  await seedSalesRepresentatives(snapshot.salesRepresentative);
  await seedSolutionsManagers(snapshot.solutionsManager);
  await seedEngagementTypes(snapshot.engagementType);

  console.log("\nProjects (S3P):");
  await seedProjects(snapshot.project);
  await seedProjectClientNames(snapshot.projectClientName);
  await seedProjectDetails(snapshot.projectDetail);
  await seedProjectDetailTeams(snapshot.projectDetailTeam);

  console.log("\nEmployees:");
  await seedEmployees(snapshot.employee);
  await seedEmployeeAddresses(snapshot.employeeAddress);
  await seedEmployeeEmployments(snapshot.employeeEmployment);
  await seedEmployeeDeployments(snapshot.employeeDeployment);

  console.log("\nDone. Audit Trail and Approvals were intentionally not seeded — they start empty in Production.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nProduction seed failed:", error);
    process.exit(1);
  });
