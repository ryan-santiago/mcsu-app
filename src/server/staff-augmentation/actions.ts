"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { staffAugmentationEngagement } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { AuthorizationError, authorize } from "@/lib/session";
import { staffAugmentationFormSchema, type StaffAugmentationFormInput } from "@/lib/validation/staff-augmentation";

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[staff-augmentation] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function createStaffAugmentationEngagement(
  input: StaffAugmentationFormInput,
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("staff_augmentation:write");
    const data = staffAugmentationFormSchema.parse(input);

    const id = crypto.randomUUID();
    await db.insert(staffAugmentationEngagement).values({
      id,
      name: data.name,
      createdBy: actor.id,
    });

    await recordAudit({
      module: "staff_augmentation",
      action: "created",
      entityId: id,
      entityLabel: data.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { name: data.name }, { name: "Name" }),
    });

    revalidatePath("/staff-augmentation");
    return { ok: true, data: { id }, message: `"${data.name}" added.` };
  });
}
