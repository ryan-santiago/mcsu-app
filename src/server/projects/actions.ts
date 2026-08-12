"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { employeeDeployment, project, projectClientName, projectDetail, projectDetailTeam } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { AuthorizationError, authorize } from "@/lib/session";
import {
  projectDetailSchema,
  projectProfileSchema,
  type ProjectDetailInput,
  type ProjectProfileInput,
} from "@/lib/validation/project";
import { listLookupOptions } from "@/server/maintenance/queries";
import type { LookupKind, LookupOption } from "@/server/maintenance/types";

import { getProjectById, listProjects } from "./queries";
import type { ProjectDetail, ProjectFilters, ProjectListResult } from "./types";

const idSchema = z.string().min(1, "A record must be selected");

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[projects] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshProjectViews(projectId?: string) {
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

async function loadProjectLabel(id: string): Promise<string | null> {
  const [row] = await db.select({ name: project.name }).from(project).where(eq(project.id, id)).limit(1);
  return row?.name ?? null;
}

/** Whole-list replace — simplest correct approach for a short, unordered list of alternate names. */
async function replaceClientNames(projectId: string, names: string[]) {
  await db.delete(projectClientName).where(eq(projectClientName.projectId, projectId));
  const unique = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (unique.length > 0) {
    await db.insert(projectClientName).values(unique.map((name) => ({ id: crypto.randomUUID(), projectId, name })));
  }
}

/** Same whole-list replace approach for a detail line's assigned teams. */
async function replaceDetailTeams(projectDetailId: string, teamIds: string[]) {
  await db.delete(projectDetailTeam).where(eq(projectDetailTeam.projectDetailId, projectDetailId));
  const unique = Array.from(new Set(teamIds));
  if (unique.length > 0) {
    await db
      .insert(projectDetailTeam)
      .values(unique.map((teamId) => ({ id: crypto.randomUUID(), projectDetailId, teamId })));
  }
}

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

export async function fetchProjects(filters: ProjectFilters): Promise<ProjectListResult> {
  return listProjects(filters);
}

export async function fetchProject(id: string): Promise<ProjectDetail | null> {
  return getProjectById(id);
}

/** Active options for the Client/Sales Representative/Solutions Manager/Engagement Type/Team pickers in the project form. */
export async function fetchProjectLookupOptions(kind: LookupKind): Promise<LookupOption[]> {
  await authorize("projects:read");
  return listLookupOptions(kind);
}

/* -------------------------------------------------------------------------- */
/*  Project profile                                                          */
/* -------------------------------------------------------------------------- */

export async function createProject(input: ProjectProfileInput): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("projects:write");
    const data = projectProfileSchema.parse(input);

    const [existing] = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.s3pNumber, data.s3pNumber))
      .limit(1);
    if (existing) return { ok: false, error: `S3P number "${data.s3pNumber}" already exists.` };

    const id = crypto.randomUUID();
    await db.insert(project).values({
      id,
      s3pNumber: data.s3pNumber,
      name: data.name,
      clientId: data.clientId,
      salesRepresentativeId: data.salesRepresentativeId,
      solutionsManagerId: data.solutionsManagerId,
      engagementTypeId: data.engagementTypeId,
      startDate: data.startDate,
      endDate: data.endDate || null,
    });
    await replaceClientNames(id, data.clientNames);

    await recordAudit({
      module: "projects",
      action: "created",
      entityId: id,
      entityLabel: data.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { s3pNumber: data.s3pNumber, name: data.name, client: data.clientId },
        { s3pNumber: "S3P Number", name: "Name", client: "Client" },
      ),
    });

    refreshProjectViews();
    return { ok: true, data: { id }, message: `Project "${data.name}" created.` };
  });
}

export async function updateProject(input: { id: string } & ProjectProfileInput): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("projects:edit");
    const id = idSchema.parse(input.id);
    const data = projectProfileSchema.parse(input);

    const [target] = await db.select().from(project).where(eq(project.id, id)).limit(1);
    if (!target) return { ok: false, error: "That project no longer exists." };

    const [duplicate] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.s3pNumber, data.s3pNumber), ne(project.id, id)))
      .limit(1);
    if (duplicate) return { ok: false, error: `S3P number "${data.s3pNumber}" already exists.` };

    await db
      .update(project)
      .set({
        s3pNumber: data.s3pNumber,
        name: data.name,
        clientId: data.clientId,
        salesRepresentativeId: data.salesRepresentativeId,
        solutionsManagerId: data.solutionsManagerId,
        engagementTypeId: data.engagementTypeId,
        startDate: data.startDate,
        endDate: data.endDate || null,
      })
      .where(eq(project.id, id));
    await replaceClientNames(id, data.clientNames);

    await recordAudit({
      module: "projects",
      action: "updated",
      entityId: id,
      entityLabel: data.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { s3pNumber: target.s3pNumber, name: target.name, client: target.clientId },
        { s3pNumber: data.s3pNumber, name: data.name, client: data.clientId },
        { s3pNumber: "S3P Number", name: "Name", client: "Client" },
      ),
    });

    refreshProjectViews(id);
    return { ok: true, data: undefined, message: `Project "${data.name}" updated.` };
  });
}

export async function deleteProject(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("projects:delete");
    const id = idSchema.parse(input.id);

    const [target] = await db.select().from(project).where(eq(project.id, id)).limit(1);
    if (!target) return { ok: false, error: "That project no longer exists." };

    const [{ total }] = await db
      .select({ total: count() })
      .from(employeeDeployment)
      .where(eq(employeeDeployment.projectId, id));
    if (total > 0) {
      return {
        ok: false,
        error: `Cannot delete — ${total} employee deployment record${total === 1 ? "" : "s"} reference "${target.name}". Reassign them first.`,
      };
    }

    await recordAudit({
      module: "projects",
      action: "deleted",
      entityId: id,
      entityLabel: target.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ s3pNumber: target.s3pNumber, name: target.name }, null, {
        s3pNumber: "S3P Number",
        name: "Name",
      }),
    });

    await db.delete(project).where(eq(project.id, id));

    refreshProjectViews();
    return { ok: true, data: undefined, message: `Project "${target.name}" deleted.` };
  });
}

/* -------------------------------------------------------------------------- */
/*  S3P details (line items)                                                 */
/* -------------------------------------------------------------------------- */

export async function addProjectDetail(input: { projectId: string } & ProjectDetailInput): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("projects:edit");
    const projectId = idSchema.parse(input.projectId);
    const data = projectDetailSchema.parse(input);

    const label = await loadProjectLabel(projectId);
    if (!label) return { ok: false, error: "That project no longer exists." };

    const id = crypto.randomUUID();
    await db.insert(projectDetail).values({
      id,
      projectId,
      description: data.description,
      contractPrice: data.contractPrice,
      estimatedCost: data.estimatedCost,
    });
    await replaceDetailTeams(id, data.teamIds);

    await recordAudit({
      module: "projects",
      action: "line_item_added",
      entityId: projectId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { description: data.description, contractPrice: data.contractPrice, estimatedCost: data.estimatedCost },
        { description: "Description", contractPrice: "Contract price", estimatedCost: "Estimated cost" },
      ),
    });

    refreshProjectViews(projectId);
    return { ok: true, data: undefined, message: "S3P detail added." };
  });
}

export async function updateProjectDetail(
  input: { id: string; projectId: string } & ProjectDetailInput,
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("projects:edit");
    const id = idSchema.parse(input.id);
    const projectId = idSchema.parse(input.projectId);
    const data = projectDetailSchema.parse(input);

    const [existing] = await db
      .select()
      .from(projectDetail)
      .where(and(eq(projectDetail.id, id), eq(projectDetail.projectId, projectId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That S3P detail no longer exists." };

    const label = await loadProjectLabel(projectId);
    if (!label) return { ok: false, error: "That project no longer exists." };

    await db
      .update(projectDetail)
      .set({ description: data.description, contractPrice: data.contractPrice, estimatedCost: data.estimatedCost })
      .where(eq(projectDetail.id, id));
    await replaceDetailTeams(id, data.teamIds);

    await recordAudit({
      module: "projects",
      action: "line_item_updated",
      entityId: projectId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        {
          description: existing.description,
          contractPrice: existing.contractPrice,
          estimatedCost: existing.estimatedCost,
        },
        { description: data.description, contractPrice: data.contractPrice, estimatedCost: data.estimatedCost },
        { description: "Description", contractPrice: "Contract price", estimatedCost: "Estimated cost" },
      ),
    });

    refreshProjectViews(projectId);
    return { ok: true, data: undefined, message: "S3P detail updated." };
  });
}

export async function deleteProjectDetail(input: { id: string; projectId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("projects:delete");
    const id = idSchema.parse(input.id);
    const projectId = idSchema.parse(input.projectId);

    const [existing] = await db
      .select()
      .from(projectDetail)
      .where(and(eq(projectDetail.id, id), eq(projectDetail.projectId, projectId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That S3P detail no longer exists." };

    const label = await loadProjectLabel(projectId);

    await recordAudit({
      module: "projects",
      action: "line_item_removed",
      entityId: projectId,
      entityLabel: label ?? projectId,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ description: existing.description }, null, { description: "Description" }),
    });

    await db.delete(projectDetail).where(eq(projectDetail.id, id));

    refreshProjectViews(projectId);
    return { ok: true, data: undefined, message: "S3P detail removed." };
  });
}
