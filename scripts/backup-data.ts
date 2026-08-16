/**
 * Snapshots every table except Audit Trail (`audit_log`) and Approvals
 * (`employee_change_request`) into `scripts/seed-data/production-seed.json`
 * — a seed file to replay into a fresh Production database later via
 * `npm run db:seed:production`. See docs/SETUP.md.
 *
 * `session`, `verification` and `account` are excluded too: session data is
 * ephemeral, and `account` holds password hashes — every seeded account gets
 * a fixed password on replay instead (see seed-production.ts), so a hash
 * snapshot would just be dead weight.
 *
 * The output file contains employee PII (names, mobile numbers, personal
 * emails, home addresses) and is gitignored on purpose — see .gitignore.
 *
 *   npm run db:backup
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// See scripts/seed.ts for why env vars are loaded before any dynamic import
// that could construct the Neon client.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const OUTPUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "seed-data", "production-seed.json");

async function main() {
  const { db } = await import("../src/db");
  const schema = await import("../src/db/schema");

  console.log("\nBacking up MCSU data (excluding Audit Trail and Approvals)\n");

  const snapshot = {
    exportedAt: new Date().toISOString(),
    role: await db.select().from(schema.role),
    user: await db.select().from(schema.user),
    gender: await db.select().from(schema.gender),
    client: await db.select().from(schema.client),
    position: await db.select().from(schema.position),
    level: await db.select().from(schema.level),
    team: await db.select().from(schema.team),
    salesRepresentative: await db.select().from(schema.salesRepresentative),
    solutionsManager: await db.select().from(schema.solutionsManager),
    engagementType: await db.select().from(schema.engagementType),
    project: await db.select().from(schema.project),
    projectClientName: await db.select().from(schema.projectClientName),
    projectDetail: await db.select().from(schema.projectDetail),
    projectDetailTeam: await db.select().from(schema.projectDetailTeam),
    employee: await db.select().from(schema.employee),
    employeeAddress: await db.select().from(schema.employeeAddress),
    employeeEmployment: await db.select().from(schema.employeeEmployment),
    employeeDeployment: await db.select().from(schema.employeeDeployment),
  };

  for (const [table, rows] of Object.entries(snapshot)) {
    if (Array.isArray(rows)) console.log(`  ${table.padEnd(22)} ${rows.length}`);
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(snapshot, null, 2) + "\n");

  console.log(`\nWrote ${OUTPUT_PATH}`);
  console.log(`Passwords are NOT included — db:seed:production sets every account to one fixed password.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nBackup failed:", error);
    process.exit(1);
  });
