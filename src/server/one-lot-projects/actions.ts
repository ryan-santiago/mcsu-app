"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { oneLotProject, oneLotProjectMember } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { AuthorizationError, authorize } from "@/lib/session";
import { oneLotProjectFormSchema, type OneLotProjectFormInput } from "@/lib/validation/one-lot-project";

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
    if (actor.employeeId) {
      await db.insert(oneLotProjectMember).values({
        id: crypto.randomUUID(),
        projectId: id,
        employeeId: actor.employeeId,
      });
    }

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
