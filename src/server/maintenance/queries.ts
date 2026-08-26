import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  client,
  employmentType,
  engagementType,
  gender,
  jobPostingSource,
  level,
  position,
  salesRepresentative,
  solutionsManager,
  team,
} from "@/db/schema";
import { authorize } from "@/lib/session";

import type { LookupKind, LookupOption, LookupRow } from "./types";

/** Each kind maps to a physically separate table — see `db/schema.ts`'s `lookupColumns()`. */
function tableFor(kind: LookupKind) {
  switch (kind) {
    case "client":
      return client;
    case "position":
      return position;
    case "level":
      return level;
    case "gender":
      return gender;
    case "team":
      return team;
    case "sales_representative":
      return salesRepresentative;
    case "solutions_manager":
      return solutionsManager;
    case "engagement_type":
      return engagementType;
    case "employment_type":
      return employmentType;
    case "job_posting_source":
      return jobPostingSource;
  }
}

/** Full rows (active and inactive) for the Maintenance admin screen. */
export async function listLookup(kind: LookupKind): Promise<LookupRow[]> {
  await authorize("maintenance:read");
  const table = tableFor(kind);
  return db.select().from(table).orderBy(asc(table.name));
}

/**
 * Active-only id/name pairs for pickers elsewhere (the Employee form's
 * Gender/Team/Level/Position/Client selects). Deliberately **not**
 * authorization-gated here — callers authorize for their own permission
 * (`employees:read`, not `maintenance:read`) before calling this, since a
 * Manager without Maintenance access still needs to pick from these lists.
 */
export async function listLookupOptions(kind: LookupKind): Promise<LookupOption[]> {
  const table = tableFor(kind);
  return db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(eq(table.isActive, true))
    .orderBy(asc(table.name));
}
