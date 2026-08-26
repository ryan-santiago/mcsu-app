"use server";

import { revalidatePath } from "next/cache";
import { count, eq, ne, and } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  client,
  employee,
  employeeDeployment,
  employeeEmployment,
  employmentType,
  engagementType,
  gender,
  jobPostingSource,
  jobProfile,
  level,
  position,
  project,
  projectDetailTeam,
  salesRepresentative,
  solutionsManager,
  taApplication,
  taRequest,
  team,
} from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { AuthorizationError, authorize } from "@/lib/session";
import { emailSchema } from "@/lib/validation/auth";

import { listLookup } from "./queries";
import { LOOKUP_META, type LookupKind, type LookupRow } from "./types";

const kindSchema = z.enum([
  "client",
  "position",
  "level",
  "gender",
  "team",
  "sales_representative",
  "solutions_manager",
  "engagement_type",
  "employment_type",
  "job_posting_source",
]);
const nameSchema = z.string().trim().min(1, "Name is required").max(100, "That name is too long");
const optionalEmailSchema = emailSchema.optional().or(z.literal(""));
const idSchema = z.string().min(1, "A record must be selected");

/** The two lookup kinds carrying an email column — see `db/schema.ts`. Narrowly typed, unlike `tableFor()`'s union. */
function emailTableFor(kind: LookupKind) {
  switch (kind) {
    case "sales_representative":
      return salesRepresentative;
    case "solutions_manager":
      return solutionsManager;
    default:
      return null;
  }
}

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

/** How many domain rows depend on a given lookup row — delete is refused if this is nonzero. */
async function usageCount(kind: LookupKind, id: string): Promise<number> {
  switch (kind) {
    case "gender": {
      const [row] = await db.select({ total: count() }).from(employee).where(eq(employee.genderId, id));
      return row?.total ?? 0;
    }
    case "team": {
      const [employeeRow] = await db.select({ total: count() }).from(employee).where(eq(employee.teamId, id));
      const [detailTeamRow] = await db
        .select({ total: count() })
        .from(projectDetailTeam)
        .where(eq(projectDetailTeam.teamId, id));
      return (employeeRow?.total ?? 0) + (detailTeamRow?.total ?? 0);
    }
    case "level": {
      const [employmentRow] = await db
        .select({ total: count() })
        .from(employeeEmployment)
        .where(eq(employeeEmployment.levelId, id));
      const [profileRow] = await db.select({ total: count() }).from(jobProfile).where(eq(jobProfile.levelId, id));
      return (employmentRow?.total ?? 0) + (profileRow?.total ?? 0);
    }
    case "position": {
      const [employmentRow] = await db
        .select({ total: count() })
        .from(employeeEmployment)
        .where(eq(employeeEmployment.positionId, id));
      const [profileRow] = await db.select({ total: count() }).from(jobProfile).where(eq(jobProfile.positionId, id));
      return (employmentRow?.total ?? 0) + (profileRow?.total ?? 0);
    }
    case "client": {
      const [deploymentRow] = await db
        .select({ total: count() })
        .from(employeeDeployment)
        .where(eq(employeeDeployment.clientId, id));
      const [projectRow] = await db.select({ total: count() }).from(project).where(eq(project.clientId, id));
      const [taRequestRow] = await db.select({ total: count() }).from(taRequest).where(eq(taRequest.clientId, id));
      return (deploymentRow?.total ?? 0) + (projectRow?.total ?? 0) + (taRequestRow?.total ?? 0);
    }
    case "sales_representative": {
      const [row] = await db
        .select({ total: count() })
        .from(project)
        .where(eq(project.salesRepresentativeId, id));
      return row?.total ?? 0;
    }
    case "solutions_manager": {
      const [row] = await db
        .select({ total: count() })
        .from(project)
        .where(eq(project.solutionsManagerId, id));
      return row?.total ?? 0;
    }
    case "engagement_type": {
      const [row] = await db
        .select({ total: count() })
        .from(project)
        .where(eq(project.engagementTypeId, id));
      return row?.total ?? 0;
    }
    case "employment_type": {
      const [row] = await db
        .select({ total: count() })
        .from(employeeEmployment)
        .where(eq(employeeEmployment.employmentTypeId, id));
      return row?.total ?? 0;
    }
    case "job_posting_source": {
      const [row] = await db.select({ total: count() }).from(taApplication).where(eq(taApplication.sourceId, id));
      return row?.total ?? 0;
    }
  }
}

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[maintenance] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshMaintenanceViews() {
  revalidatePath("/admin/maintenance");
}

/** Server-action entry point for the Maintenance table's TanStack Query `queryFn`. */
export async function fetchLookup(kind: LookupKind): Promise<LookupRow[]> {
  return listLookup(kind);
}

export async function createLookupEntry(input: {
  kind: LookupKind;
  name: string;
  email?: string;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("maintenance:write");
    const kind = kindSchema.parse(input.kind);
    const name = nameSchema.parse(input.name);
    const meta = LOOKUP_META[kind];
    const table = tableFor(kind);
    const email = meta.hasEmail ? optionalEmailSchema.parse(input.email) || null : null;

    const [existing] = await db.select({ id: table.id }).from(table).where(eq(table.name, name)).limit(1);
    if (existing) return { ok: false, error: `${meta.singular} "${name}" already exists.` };

    const id = crypto.randomUUID();
    const emailTable = emailTableFor(kind);
    if (emailTable) {
      await db.insert(emailTable).values({ id, name, email });
    } else {
      await db.insert(table).values({ id, name });
    }

    await recordAudit({
      module: meta.auditModule,
      action: "created",
      entityId: id,
      entityLabel: name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: meta.hasEmail
        ? diffFields(null, { name, email }, { name: "Name", email: "Email" })
        : diffFields(null, { name }, { name: "Name" }),
    });

    refreshMaintenanceViews();
    return { ok: true, data: { id }, message: `${meta.singular} "${name}" added.` };
  });
}

export async function updateLookupEntry(input: {
  kind: LookupKind;
  id: string;
  name: string;
  email?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("maintenance:edit");
    const kind = kindSchema.parse(input.kind);
    const id = idSchema.parse(input.id);
    const name = nameSchema.parse(input.name);
    const meta = LOOKUP_META[kind];
    const table = tableFor(kind);
    const email = meta.hasEmail ? optionalEmailSchema.parse(input.email) || null : null;

    const [target] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!target) return { ok: false, error: `That ${meta.singular.toLowerCase()} no longer exists.` };

    const [duplicate] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.name, name), ne(table.id, id)))
      .limit(1);
    if (duplicate) return { ok: false, error: `${meta.singular} "${name}" already exists.` };

    const emailTable = emailTableFor(kind);
    if (emailTable) {
      await db.update(emailTable).set({ name, email }).where(eq(emailTable.id, id));
    } else {
      await db.update(table).set({ name }).where(eq(table.id, id));
    }

    await recordAudit({
      module: meta.auditModule,
      action: "updated",
      entityId: id,
      entityLabel: name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: meta.hasEmail
        ? diffFields(
            { name: target.name, email: (target as LookupRow).email ?? null },
            { name, email },
            { name: "Name", email: "Email" },
          )
        : diffFields({ name: target.name }, { name }, { name: "Name" }),
    });

    refreshMaintenanceViews();
    return { ok: true, data: undefined, message: `${meta.singular} renamed to "${name}".` };
  });
}

export async function setLookupActive(input: { kind: LookupKind; id: string; isActive: boolean }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("maintenance:edit");
    const kind = kindSchema.parse(input.kind);
    const id = idSchema.parse(input.id);
    const meta = LOOKUP_META[kind];
    const table = tableFor(kind);

    const [target] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!target) return { ok: false, error: `That ${meta.singular.toLowerCase()} no longer exists.` };
    if (target.isActive === input.isActive) {
      return { ok: false, error: `${target.name} is already ${input.isActive ? "active" : "inactive"}.` };
    }

    await db.update(table).set({ isActive: input.isActive }).where(eq(table.id, id));

    await recordAudit({
      module: meta.auditModule,
      action: input.isActive ? "activated" : "deactivated",
      entityId: id,
      entityLabel: target.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ isActive: target.isActive }, { isActive: input.isActive }, { isActive: "Active" }),
    });

    refreshMaintenanceViews();
    return {
      ok: true,
      data: undefined,
      message: input.isActive ? `${target.name} reactivated.` : `${target.name} deactivated.`,
    };
  });
}

export async function deleteLookupEntry(input: { kind: LookupKind; id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("maintenance:delete");
    const kind = kindSchema.parse(input.kind);
    const id = idSchema.parse(input.id);
    const meta = LOOKUP_META[kind];
    const table = tableFor(kind);

    const [target] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!target) return { ok: false, error: `That ${meta.singular.toLowerCase()} no longer exists.` };

    const usage = await usageCount(kind, id);
    if (usage > 0) {
      return {
        ok: false,
        error: `Cannot delete — ${target.name} is used by ${usage} other record${usage === 1 ? "" : "s"}. Deactivate it instead.`,
      };
    }

    await recordAudit({
      module: meta.auditModule,
      action: "deleted",
      entityId: id,
      entityLabel: target.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ name: target.name }, null, { name: "Name" }),
    });

    await db.delete(table).where(eq(table.id, id));

    refreshMaintenanceViews();
    return { ok: true, data: undefined, message: `${meta.singular} "${target.name}" removed.` };
  });
}
