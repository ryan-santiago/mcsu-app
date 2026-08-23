"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { employee, staffAugmentationAssignment, staffAugmentationEngagement } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { formatEmployeeName } from "@/lib/employee-format";
import { AuthorizationError, authorize } from "@/lib/session";
import {
  staffAugmentationAssignmentSchema,
  staffAugmentationFormSchema,
  type StaffAugmentationAssignmentInput,
  type StaffAugmentationFormInput,
} from "@/lib/validation/staff-augmentation";
import { getStaffAugmentationEngagementById, listStaffAugmentationEmployeeOptions } from "./queries";
import type { EmployeeOption } from "./types";

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

/**
 * Gated on `staff_augmentation:edit`, not `:read` — same reasoning as
 * `fetchEmployeeOptionsForDeployment` in `src/server/devices/actions.ts`:
 * only someone who can actually change the roster needs the option list.
 */
export async function fetchStaffAugmentationEmployeeOptions(engagementId: string): Promise<EmployeeOption[]> {
  await authorize("staff_augmentation:edit");
  return listStaffAugmentationEmployeeOptions(engagementId);
}

export async function addStaffAugmentationAssignment(
  input: StaffAugmentationAssignmentInput & { engagementId: string },
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("staff_augmentation:edit");
    const data = staffAugmentationAssignmentSchema.parse(input);

    const engagement = await getStaffAugmentationEngagementById(input.engagementId);
    if (!engagement) return { ok: false, error: "This engagement no longer exists." };

    const [person] = await db.select().from(employee).where(eq(employee.id, data.employeeId)).limit(1);
    if (!person) return { ok: false, error: "That employee no longer exists." };

    const [existing] = await db
      .select({ id: staffAugmentationAssignment.id })
      .from(staffAugmentationAssignment)
      .where(
        and(
          eq(staffAugmentationAssignment.engagementId, input.engagementId),
          eq(staffAugmentationAssignment.employeeId, data.employeeId),
        ),
      )
      .limit(1);
    const employeeName = formatEmployeeName(person);
    if (existing) return { ok: false, error: `${employeeName} is already staffed on this engagement.` };

    const id = crypto.randomUUID();
    await db.insert(staffAugmentationAssignment).values({
      id,
      engagementId: input.engagementId,
      employeeId: data.employeeId,
      createdBy: actor.id,
    });

    await recordAudit({
      module: "staff_augmentation",
      action: "employee_added",
      entityId: engagement.id,
      entityLabel: engagement.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { employee: employeeName }, { employee: "Employee" }),
    });

    revalidatePath(`/staff-augmentation/${input.engagementId}`);
    return { ok: true, data: { id }, message: `${employeeName} added to ${engagement.name}.` };
  });
}

export async function removeStaffAugmentationAssignment(input: {
  id: string;
  engagementId: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("staff_augmentation:delete");

    const [target] = await db
      .select({
        id: staffAugmentationAssignment.id,
        firstName: employee.firstName,
        middleName: employee.middleName,
        lastName: employee.lastName,
      })
      .from(staffAugmentationAssignment)
      .innerJoin(employee, eq(employee.id, staffAugmentationAssignment.employeeId))
      .where(
        and(eq(staffAugmentationAssignment.id, input.id), eq(staffAugmentationAssignment.engagementId, input.engagementId)),
      )
      .limit(1);
    if (!target) return { ok: false, error: "That staffing record no longer exists." };

    const engagement = await getStaffAugmentationEngagementById(input.engagementId);
    const employeeName = formatEmployeeName(target);

    await db.delete(staffAugmentationAssignment).where(eq(staffAugmentationAssignment.id, input.id));

    await recordAudit({
      module: "staff_augmentation",
      action: "employee_removed",
      entityId: input.engagementId,
      entityLabel: engagement?.name ?? input.engagementId,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ employee: employeeName }, null, { employee: "Employee" }),
    });

    revalidatePath(`/staff-augmentation/${input.engagementId}`);
    return {
      ok: true,
      data: undefined,
      message: `${employeeName} removed from ${engagement?.name ?? "the engagement"}.`,
    };
  });
}
