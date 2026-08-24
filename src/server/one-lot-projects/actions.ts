"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { oneLotProject, oneLotProjectBoardColumn, oneLotProjectMember, oneLotProjectS3pProject, project, user } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { AuthorizationError, authorize } from "@/lib/session";
import {
  oneLotProjectFormSchema,
  oneLotProjectMemberSchema,
  oneLotProjectS3pLinkSchema,
  type OneLotProjectFormInput,
  type OneLotProjectMemberInput,
  type OneLotProjectS3pLinkInput,
} from "@/lib/validation/one-lot-project";
import type { ProjectSearchOption } from "@/server/projects/types";

import {
  getOneLotProjectByIdUnrestricted,
  listOneLotProjectMemberOptions,
  searchOneLotProjectS3pOptions,
} from "./queries";
import type { UserOption } from "./types";

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[one-lot-projects] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function createOneLotProject(input: OneLotProjectFormInput): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:write");
    const data = oneLotProjectFormSchema.parse(input);

    const id = crypto.randomUUID();
    await db.insert(oneLotProject).values({
      id,
      name: data.name,
      createdBy: actor.id,
    });

    // The creator is also recorded as a member — otherwise they'd appear
    // nowhere in future member-management UI, only invisibly via `createdBy`.
    await db.insert(oneLotProjectMember).values({
      id: crypto.randomUUID(),
      projectId: id,
      userId: actor.id,
    });

    // Every project ships with the four default Kanban columns — "To Do" is
    // where new work items land (`isDefault`), "Done" is what completing a
    // sprint treats as finished (`isDone`). More can be added later via "+".
    await db.insert(oneLotProjectBoardColumn).values([
      { id: crypto.randomUUID(), projectId: id, name: "To Do", sortOrder: 0, isDefault: true, isDone: false },
      { id: crypto.randomUUID(), projectId: id, name: "In Progress", sortOrder: 1, isDefault: false, isDone: false },
      { id: crypto.randomUUID(), projectId: id, name: "In Review", sortOrder: 2, isDefault: false, isDone: false },
      { id: crypto.randomUUID(), projectId: id, name: "Done", sortOrder: 3, isDefault: false, isDone: true },
    ]);

    await recordAudit({
      module: "one_lot_projects",
      action: "created",
      entityId: id,
      entityLabel: data.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { name: data.name }, { name: "Name" }),
    });

    revalidatePath("/one-lot-projects");
    return { ok: true, data: { id }, message: `"${data.name}" added.` };
  });
}

/**
 * Gated on `one_lot_projects:edit`, not `:read` — only someone who can
 * change the roster needs the option list, mirrors
 * `fetchStaffAugmentationEmployeeOptions`.
 */
export async function fetchOneLotProjectMemberOptions(projectId: string, search?: string): Promise<UserOption[]> {
  await authorize("one_lot_projects:edit");
  return listOneLotProjectMemberOptions(projectId, search);
}

export async function addOneLotProjectMember(
  input: OneLotProjectMemberInput & { projectId: string },
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:edit");
    const data = oneLotProjectMemberSchema.parse(input);

    const oneLotProjectRow = await getOneLotProjectByIdUnrestricted(input.projectId);
    if (!oneLotProjectRow) return { ok: false, error: "This project no longer exists." };

    const [person] = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.id, data.userId))
      .limit(1);
    if (!person) return { ok: false, error: "That user no longer exists." };

    const [existing] = await db
      .select({ id: oneLotProjectMember.id })
      .from(oneLotProjectMember)
      .where(and(eq(oneLotProjectMember.projectId, input.projectId), eq(oneLotProjectMember.userId, data.userId)))
      .limit(1);
    if (existing) return { ok: false, error: `${person.name} is already a member of this project.` };

    const id = crypto.randomUUID();
    await db.insert(oneLotProjectMember).values({ id, projectId: input.projectId, userId: data.userId });

    await recordAudit({
      module: "one_lot_projects",
      action: "member_added",
      entityId: oneLotProjectRow.id,
      entityLabel: oneLotProjectRow.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { member: person.name }, { member: "Member" }),
    });

    revalidatePath(`/one-lot-projects/${input.projectId}/dashboard`);
    return { ok: true, data: { id }, message: `${person.name} added to ${oneLotProjectRow.name}.` };
  });
}

export async function removeOneLotProjectMember(input: { id: string; projectId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:delete");

    const [target] = await db
      .select({ id: oneLotProjectMember.id, name: user.name })
      .from(oneLotProjectMember)
      .innerJoin(user, eq(user.id, oneLotProjectMember.userId))
      .where(and(eq(oneLotProjectMember.id, input.id), eq(oneLotProjectMember.projectId, input.projectId)))
      .limit(1);
    if (!target) return { ok: false, error: "That member record no longer exists." };

    const oneLotProjectRow = await getOneLotProjectByIdUnrestricted(input.projectId);

    await db.delete(oneLotProjectMember).where(eq(oneLotProjectMember.id, input.id));

    await recordAudit({
      module: "one_lot_projects",
      action: "member_removed",
      entityId: input.projectId,
      entityLabel: oneLotProjectRow?.name ?? input.projectId,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ member: target.name }, null, { member: "Member" }),
    });

    revalidatePath(`/one-lot-projects/${input.projectId}/dashboard`);
    return {
      ok: true,
      data: undefined,
      message: `${target.name} removed from ${oneLotProjectRow?.name ?? "the project"}.`,
    };
  });
}

/**
 * Gated on `one_lot_projects:edit`, wraps search scoped to S3P projects not
 * yet linked to this one-lot project — mirrors `searchProjectsForDeployment`
 * in `src/server/employees/actions.ts`.
 */
export async function searchOneLotProjectS3pProjects(
  projectId: string,
  search: string,
): Promise<ProjectSearchOption[]> {
  await authorize("one_lot_projects:edit");
  return searchOneLotProjectS3pOptions(projectId, search);
}

export async function linkOneLotProjectS3pProject(
  input: OneLotProjectS3pLinkInput & { oneLotProjectId: string },
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:edit");
    const data = oneLotProjectS3pLinkSchema.parse(input);

    const oneLotProjectRow = await getOneLotProjectByIdUnrestricted(input.oneLotProjectId);
    if (!oneLotProjectRow) return { ok: false, error: "This project no longer exists." };

    const [s3p] = await db
      .select({ id: project.id, name: project.name })
      .from(project)
      .where(eq(project.id, data.projectId))
      .limit(1);
    if (!s3p) return { ok: false, error: "That S3P project no longer exists." };

    const [existing] = await db
      .select({ id: oneLotProjectS3pProject.id })
      .from(oneLotProjectS3pProject)
      .where(
        and(
          eq(oneLotProjectS3pProject.oneLotProjectId, input.oneLotProjectId),
          eq(oneLotProjectS3pProject.projectId, data.projectId),
        ),
      )
      .limit(1);
    if (existing) return { ok: false, error: `${s3p.name} is already linked to this project.` };

    const id = crypto.randomUUID();
    await db.insert(oneLotProjectS3pProject).values({
      id,
      oneLotProjectId: input.oneLotProjectId,
      projectId: data.projectId,
      createdBy: actor.id,
    });

    await recordAudit({
      module: "one_lot_projects",
      action: "s3p_project_linked",
      entityId: oneLotProjectRow.id,
      entityLabel: oneLotProjectRow.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { s3pProject: s3p.name }, { s3pProject: "S3P project" }),
    });

    revalidatePath(`/one-lot-projects/${input.oneLotProjectId}/dashboard`);
    return { ok: true, data: { id }, message: `${s3p.name} linked to ${oneLotProjectRow.name}.` };
  });
}

export async function unlinkOneLotProjectS3pProject(input: {
  id: string;
  oneLotProjectId: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:delete");

    const [target] = await db
      .select({ id: oneLotProjectS3pProject.id, name: project.name })
      .from(oneLotProjectS3pProject)
      .innerJoin(project, eq(project.id, oneLotProjectS3pProject.projectId))
      .where(
        and(
          eq(oneLotProjectS3pProject.id, input.id),
          eq(oneLotProjectS3pProject.oneLotProjectId, input.oneLotProjectId),
        ),
      )
      .limit(1);
    if (!target) return { ok: false, error: "That link no longer exists." };

    const oneLotProjectRow = await getOneLotProjectByIdUnrestricted(input.oneLotProjectId);

    await db.delete(oneLotProjectS3pProject).where(eq(oneLotProjectS3pProject.id, input.id));

    await recordAudit({
      module: "one_lot_projects",
      action: "s3p_project_unlinked",
      entityId: input.oneLotProjectId,
      entityLabel: oneLotProjectRow?.name ?? input.oneLotProjectId,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ s3pProject: target.name }, null, { s3pProject: "S3P project" }),
    });

    revalidatePath(`/one-lot-projects/${input.oneLotProjectId}/dashboard`);
    return {
      ok: true,
      data: undefined,
      message: `${target.name} unlinked from ${oneLotProjectRow?.name ?? "the project"}.`,
    };
  });
}
