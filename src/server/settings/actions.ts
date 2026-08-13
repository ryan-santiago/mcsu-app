"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { employee, employeeAddress, employeeChangeRequest, gender } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import { formatEmployeeName } from "@/lib/employee-format";
import { AuthorizationError } from "@/lib/session";
import { selfServiceFormSchema, type SelfServiceFormInput } from "@/lib/validation/employee";
import type { EmployeeDetail } from "@/server/employees/types";

import { getMyEmployeeDetail, getMyPendingChangeRequest, requireActiveUser } from "./queries";
import type { ActionResult, MyPendingChangeRequest } from "./types";

const idSchema = z.string().min(1, "A request must be selected");

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

/** Server-action entry points for the client view's TanStack Query `queryFn`s. */
export async function fetchMyEmployeeDetail(): Promise<EmployeeDetail | null> {
  return getMyEmployeeDetail();
}

export async function fetchMyPendingChangeRequest(): Promise<MyPendingChangeRequest | null> {
  return getMyPendingChangeRequest();
}

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[settings] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshMyProfile() {
  revalidatePath("/admin/settings");
}

/** Condensed to one field per address in the review diff — matches the level of detail `updateEmployee`'s own audit entries already use (they don't diff address sub-fields either). */
function formatFullAddress(
  address: { regionName: string; provinceName?: string | null; cityName: string; barangayName: string; addressLine: string } | null,
): string | null {
  if (!address) return null;
  const province = address.provinceName ? `${address.provinceName}, ` : "";
  return `${address.addressLine}, Barangay ${address.barangayName}, ${address.cityName}, ${province}${address.regionName}`;
}

export async function submitProfileChangeRequest(input: SelfServiceFormInput): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await requireActiveUser();
    if (!actor.employeeId) {
      return { ok: false, error: "Your account has no linked employee record." };
    }

    const pending = await getMyPendingChangeRequest();
    if (pending) {
      return { ok: false, error: "You already have a change request awaiting review." };
    }

    const { profile, currentAddress, permanentAddress } = selfServiceFormSchema.parse(input);

    const [existing] = await db.select().from(employee).where(eq(employee.id, actor.employeeId)).limit(1);
    if (!existing) return { ok: false, error: "Your employee record no longer exists." };

    if (profile.workEmail) {
      const [duplicateEmail] = await db
        .select({ id: employee.id })
        .from(employee)
        .where(and(eq(employee.workEmail, profile.workEmail), ne(employee.id, actor.employeeId)))
        .limit(1);
      if (duplicateEmail) return { ok: false, error: `Work email "${profile.workEmail}" is already in use.` };
    }

    const [existingGender] = await db.select({ name: gender.name }).from(gender).where(eq(gender.id, existing.genderId)).limit(1);
    const [proposedGender] = await db.select({ name: gender.name }).from(gender).where(eq(gender.id, profile.genderId)).limit(1);

    const [existingCurrentAddress, existingPermanentAddress] = await Promise.all([
      loadAddress(actor.employeeId, "current"),
      loadAddress(actor.employeeId, "permanent"),
    ]);

    const changes = diffFields(
      {
        firstName: existing.firstName,
        middleName: existing.middleName,
        lastName: existing.lastName,
        gender: existingGender?.name ?? null,
        mobileNumber: existing.mobileNumber,
        viberNumber: existing.viberNumber,
        personalEmail: existing.personalEmail,
        workEmail: existing.workEmail,
        currentAddress: formatFullAddress(existingCurrentAddress),
        permanentAddress: formatFullAddress(existingPermanentAddress),
      },
      {
        firstName: profile.firstName,
        middleName: profile.middleName || null,
        lastName: profile.lastName,
        gender: proposedGender?.name ?? null,
        mobileNumber: profile.mobileNumber,
        viberNumber: profile.viberNumber || null,
        personalEmail: profile.personalEmail || null,
        workEmail: profile.workEmail || null,
        currentAddress: formatFullAddress(currentAddress),
        permanentAddress: formatFullAddress(permanentAddress),
      },
      {
        firstName: "First name",
        middleName: "Middle name",
        lastName: "Last name",
        gender: "Gender",
        mobileNumber: "Mobile number",
        viberNumber: "Viber number",
        personalEmail: "Personal email",
        workEmail: "Work email",
        currentAddress: "Current address",
        permanentAddress: "Permanent address",
      },
    );

    if (changes.length === 0) {
      return { ok: false, error: "Nothing was changed." };
    }

    const id = crypto.randomUUID();
    await db.insert(employeeChangeRequest).values({
      id,
      employeeId: actor.employeeId,
      requestedBy: actor.id,
      status: "pending",
      proposedProfile: profile,
      proposedCurrentAddress: currentAddress,
      proposedPermanentAddress: permanentAddress,
      changes,
    });

    await recordAudit({
      module: "employees",
      action: "change_requested",
      entityId: actor.employeeId,
      entityLabel: formatEmployeeName(profile),
      actorId: actor.id,
      actorEmail: actor.email,
      changes,
    });

    refreshMyProfile();
    return { ok: true, data: { id }, message: "Change request submitted for approval." };
  });
}

export async function cancelMyChangeRequest(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActiveUser();
    const id = idSchema.parse(input.id);

    const [request] = await db.select().from(employeeChangeRequest).where(eq(employeeChangeRequest.id, id)).limit(1);
    if (!request || request.employeeId !== actor.employeeId) {
      return { ok: false, error: "That request no longer exists." };
    }
    if (request.status !== "pending") {
      return { ok: false, error: "This request has already been reviewed." };
    }

    await db.delete(employeeChangeRequest).where(eq(employeeChangeRequest.id, id));

    await recordAudit({
      module: "employees",
      action: "change_cancelled",
      entityId: actor.employeeId,
      actorId: actor.id,
      actorEmail: actor.email,
    });

    refreshMyProfile();
    return { ok: true, data: undefined, message: "Change request cancelled." };
  });
}

async function loadAddress(employeeId: string, type: "current" | "permanent") {
  const [row] = await db
    .select({
      regionName: employeeAddress.regionName,
      provinceName: employeeAddress.provinceName,
      cityName: employeeAddress.cityName,
      barangayName: employeeAddress.barangayName,
      addressLine: employeeAddress.addressLine,
    })
    .from(employeeAddress)
    .where(and(eq(employeeAddress.employeeId, employeeId), eq(employeeAddress.type, type)))
    .limit(1);
  return row ?? null;
}
