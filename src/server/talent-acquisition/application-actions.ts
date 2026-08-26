"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { taApplication, taCandidate, taRequest } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { AuthorizationError, authorize } from "@/lib/session";
import { listLookupOptions } from "@/server/maintenance/queries";
import type { LookupOption } from "@/server/maintenance/types";

import { getTaApplicationById, listTaApplications } from "./application-queries";
import type { TaApplicationRow } from "./application-types";

const applicationInputSchema = z.object({
  requestId: z.string().min(1),
  firstName: z.string().trim().min(1, "First name is required").max(100, "That's too long"),
  middleName: z.string().optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(100, "That's too long"),
  genderId: z.string().optional(),
  mobileNumber: z.string().optional(),
  personalEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  sourceId: z.string().optional(),
});

const CHANGE_LABELS = {
  firstName: "First name",
  middleName: "Middle name",
  lastName: "Last name",
  genderId: "Gender",
  mobileNumber: "Mobile number",
  personalEmail: "Personal email",
  sourceId: "Source",
};

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[talent-acquisition/applications] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Server-action entry point for the Applications list's TanStack Query `queryFn`. */
export async function fetchTaApplications(requestId: string): Promise<TaApplicationRow[]> {
  return listTaApplications(requestId);
}

/** Server-action entry point for the application detail sheet's TanStack Query `queryFn`. */
export async function fetchTaApplication(applicationId: string): Promise<TaApplicationRow | null> {
  return getTaApplicationById(applicationId);
}

/** Gated on `talent_acquisition:write`, not `:read` — only someone adding an application needs this picker. */
export async function fetchJobPostingSourceOptions(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:write");
  return listLookupOptions("job_posting_source");
}

/**
 * Creates a brand-new talent-pool person and their application to this
 * request in one step — the "add someone new" path. To add someone already
 * in the pool, use `createTaApplicationForCandidate` instead.
 */
export async function createTaApplication(input: {
  requestId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  genderId?: string;
  mobileNumber?: string;
  personalEmail?: string;
  sourceId?: string;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:write");
    const values = applicationInputSchema.parse(input);

    const [request] = await db.select().from(taRequest).where(eq(taRequest.id, values.requestId)).limit(1);
    if (!request) return { ok: false, error: "That request no longer exists." };
    if (request.status === "pending_approval") {
      return { ok: false, error: "This request is still awaiting approval — candidates can't be added yet." };
    }
    if (request.status === "cancelled") {
      return { ok: false, error: "This request is cancelled — candidates can't be added to it." };
    }

    const candidateId = crypto.randomUUID();
    const middleName = values.middleName?.trim() || null;
    const mobileNumber = values.mobileNumber?.trim() || null;
    const personalEmail = values.personalEmail?.trim() || null;
    const genderId = values.genderId || null;
    const sourceId = values.sourceId || null;

    await db.insert(taCandidate).values({
      id: candidateId,
      firstName: values.firstName,
      middleName,
      lastName: values.lastName,
      genderId,
      mobileNumber,
      personalEmail,
      createdBy: actor.id,
    });

    const applicationId = crypto.randomUUID();
    await db.insert(taApplication).values({
      id: applicationId,
      candidateId,
      requestId: values.requestId,
      sourceId,
      createdBy: actor.id,
    });

    const fullName = formatEmployeeDisplayName(values);

    await recordAudit({
      module: "ta_applications",
      action: "application_created",
      entityId: applicationId,
      entityLabel: fullName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { firstName: values.firstName, middleName, lastName: values.lastName, genderId, mobileNumber, personalEmail, sourceId },
        CHANGE_LABELS,
      ),
    });

    revalidatePath(`/talent-acquisition/${values.requestId}`);
    return { ok: true, data: { id: applicationId }, message: `${fullName} added.` };
  });
}

const applicationForCandidateSchema = z.object({
  candidateId: z.string().min(1),
  requestId: z.string().min(1),
  sourceId: z.string().optional(),
});

/** Adds an existing talent-pool person to this request — the "someone we already know" path. */
export async function createTaApplicationForCandidate(input: {
  candidateId: string;
  requestId: string;
  sourceId?: string;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:write");
    const values = applicationForCandidateSchema.parse(input);

    const [request] = await db.select().from(taRequest).where(eq(taRequest.id, values.requestId)).limit(1);
    if (!request) return { ok: false, error: "That request no longer exists." };
    if (request.status === "pending_approval") {
      return { ok: false, error: "This request is still awaiting approval — candidates can't be added yet." };
    }
    if (request.status === "cancelled") {
      return { ok: false, error: "This request is cancelled — candidates can't be added to it." };
    }

    const [candidate] = await db.select().from(taCandidate).where(eq(taCandidate.id, values.candidateId)).limit(1);
    if (!candidate) return { ok: false, error: "That candidate no longer exists." };

    const [existingActive] = await db
      .select({ id: taApplication.id })
      .from(taApplication)
      .where(and(eq(taApplication.candidateId, values.candidateId), eq(taApplication.requestId, values.requestId), eq(taApplication.status, "active")))
      .limit(1);
    if (existingActive) return { ok: false, error: "This candidate already has an active application to this request." };

    const sourceId = values.sourceId || null;
    const applicationId = crypto.randomUUID();
    await db.insert(taApplication).values({
      id: applicationId,
      candidateId: values.candidateId,
      requestId: values.requestId,
      sourceId,
      createdBy: actor.id,
    });

    const fullName = formatEmployeeDisplayName(candidate);

    await recordAudit({
      module: "ta_applications",
      action: "application_created",
      entityId: applicationId,
      entityLabel: fullName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { sourceId }, { sourceId: "Source" }),
    });

    revalidatePath(`/talent-acquisition/${values.requestId}`);
    return { ok: true, data: { id: applicationId }, message: `${fullName} added from the talent pool.` };
  });
}

export async function updateTaApplication(input: {
  id: string;
  requestId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  genderId?: string;
  mobileNumber?: string;
  personalEmail?: string;
  sourceId?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:edit");
    const values = applicationInputSchema.parse(input);

    const [target] = await db.select().from(taApplication).where(eq(taApplication.id, input.id)).limit(1);
    if (!target) return { ok: false, error: "That application no longer exists." };

    const [candidate] = await db.select().from(taCandidate).where(eq(taCandidate.id, target.candidateId)).limit(1);
    if (!candidate) return { ok: false, error: "That candidate no longer exists." };

    const middleName = values.middleName?.trim() || null;
    const mobileNumber = values.mobileNumber?.trim() || null;
    const personalEmail = values.personalEmail?.trim() || null;
    const genderId = values.genderId || null;
    const sourceId = values.sourceId || null;

    await db
      .update(taCandidate)
      .set({ firstName: values.firstName, middleName, lastName: values.lastName, genderId, mobileNumber, personalEmail })
      .where(eq(taCandidate.id, target.candidateId));

    await db.update(taApplication).set({ sourceId }).where(eq(taApplication.id, input.id));

    const fullName = formatEmployeeDisplayName(values);

    await recordAudit({
      module: "ta_applications",
      action: "application_updated",
      entityId: input.id,
      entityLabel: fullName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        {
          firstName: candidate.firstName,
          middleName: candidate.middleName,
          lastName: candidate.lastName,
          genderId: candidate.genderId,
          mobileNumber: candidate.mobileNumber,
          personalEmail: candidate.personalEmail,
          sourceId: target.sourceId,
        },
        { firstName: values.firstName, middleName, lastName: values.lastName, genderId, mobileNumber, personalEmail, sourceId },
        CHANGE_LABELS,
      ),
    });

    revalidatePath(`/talent-acquisition/${input.requestId}`);
    return { ok: true, data: undefined, message: `${fullName} updated.` };
  });
}

export async function setTaApplicationStatus(input: {
  id: string;
  requestId: string;
  status: "active" | "rejected" | "withdrawn";
  statusReason?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:edit");

    const [target] = await db.select().from(taApplication).where(eq(taApplication.id, input.id)).limit(1);
    if (!target) return { ok: false, error: "That application no longer exists." };
    if (target.status === "hired") return { ok: false, error: "This application has already been hired." };
    if (target.status === input.status) return { ok: false, error: "That's already this application's status." };

    const [candidate] = await db.select().from(taCandidate).where(eq(taCandidate.id, target.candidateId)).limit(1);
    const statusReason = input.statusReason?.trim() || null;

    await db
      .update(taApplication)
      .set({ status: input.status, statusReason, statusChangedAt: new Date(), statusChangedBy: actor.id })
      .where(eq(taApplication.id, input.id));

    const fullName = candidate ? formatEmployeeDisplayName(candidate) : "Candidate";

    await recordAudit({
      module: "ta_applications",
      action: "application_status_changed",
      entityId: input.id,
      entityLabel: fullName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ status: target.status }, { status: input.status }, { status: "Status" }),
    });

    revalidatePath(`/talent-acquisition/${input.requestId}`);
    return { ok: true, data: undefined, message: `${fullName} marked ${input.status}.` };
  });
}

/** Removes this application only — the underlying talent-pool person, their CV, and comments are untouched. */
export async function deleteTaApplication(input: { id: string; requestId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:delete");

    const [target] = await db.select().from(taApplication).where(eq(taApplication.id, input.id)).limit(1);
    if (!target) return { ok: false, error: "That application no longer exists." };

    const [candidate] = await db.select().from(taCandidate).where(eq(taCandidate.id, target.candidateId)).limit(1);
    const fullName = candidate ? formatEmployeeDisplayName(candidate) : "Candidate";

    // Cascade deletes this application's stage rows and scorecards — see `taApplicationStage`'s FK.
    await db.delete(taApplication).where(eq(taApplication.id, input.id));

    await recordAudit({
      module: "ta_applications",
      action: "deleted",
      entityId: input.id,
      entityLabel: fullName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ name: fullName }, null, { name: "Name" }),
    });

    revalidatePath(`/talent-acquisition/${input.requestId}`);
    return { ok: true, data: undefined, message: `${fullName} removed from this request.` };
  });
}
