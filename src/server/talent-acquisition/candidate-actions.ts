"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { taCandidate, taRequest } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { deleteDocumentFile, isDocumentStorageAvailable, saveDocumentFile } from "@/lib/document-storage";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { sanitizeDocumentName } from "@/lib/one-lot-project-document-format";
import { AuthorizationError, authorize } from "@/lib/session";
import { listLookupOptions } from "@/server/maintenance/queries";
import type { LookupOption } from "@/server/maintenance/types";

import { listTaCandidates } from "./candidate-queries";
import type { TaCandidateRow } from "./candidate-types";

/** A CV doesn't need the 50 MB ceiling project docs get. */
const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024;

const candidateInputSchema = z.object({
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
    console.error("[talent-acquisition/candidates] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function buildCandidateCvStorageKey(candidateId: string, fileName: string): string {
  return `Documents/Talent Acquisition/Candidates/${candidateId}/cv-${sanitizeDocumentName(fileName)}`;
}

/** Server-action entry point for the Candidates list's TanStack Query `queryFn`. */
export async function fetchTaCandidates(requestId: string): Promise<TaCandidateRow[]> {
  return listTaCandidates(requestId);
}

/** Gated on `talent_acquisition:write`, not `:read` — only someone adding a candidate needs these pickers. */
export async function fetchGenderOptions(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:write");
  return listLookupOptions("gender");
}

export async function fetchJobPostingSourceOptions(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:write");
  return listLookupOptions("job_posting_source");
}

export async function createTaCandidate(input: {
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
    const values = candidateInputSchema.parse(input);

    const [request] = await db.select().from(taRequest).where(eq(taRequest.id, values.requestId)).limit(1);
    if (!request) return { ok: false, error: "That request no longer exists." };
    if (request.status === "cancelled") {
      return { ok: false, error: "This request is cancelled — candidates can't be added to it." };
    }

    const id = crypto.randomUUID();
    const middleName = values.middleName?.trim() || null;
    const mobileNumber = values.mobileNumber?.trim() || null;
    const personalEmail = values.personalEmail?.trim() || null;
    const genderId = values.genderId || null;
    const sourceId = values.sourceId || null;

    await db.insert(taCandidate).values({
      id,
      requestId: values.requestId,
      firstName: values.firstName,
      middleName,
      lastName: values.lastName,
      genderId,
      mobileNumber,
      personalEmail,
      sourceId,
      createdBy: actor.id,
    });

    const fullName = formatEmployeeDisplayName(values);

    await recordAudit({
      module: "ta_candidates",
      action: "candidate_added",
      entityId: id,
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
    return { ok: true, data: { id }, message: `${fullName} added.` };
  });
}

export async function updateTaCandidate(input: {
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
    const values = candidateInputSchema.parse(input);

    const [target] = await db.select().from(taCandidate).where(eq(taCandidate.id, input.id)).limit(1);
    if (!target) return { ok: false, error: "That candidate no longer exists." };

    const middleName = values.middleName?.trim() || null;
    const mobileNumber = values.mobileNumber?.trim() || null;
    const personalEmail = values.personalEmail?.trim() || null;
    const genderId = values.genderId || null;
    const sourceId = values.sourceId || null;

    await db
      .update(taCandidate)
      .set({
        firstName: values.firstName,
        middleName,
        lastName: values.lastName,
        genderId,
        mobileNumber,
        personalEmail,
        sourceId,
      })
      .where(eq(taCandidate.id, input.id));

    const fullName = formatEmployeeDisplayName(values);

    await recordAudit({
      module: "ta_candidates",
      action: "candidate_updated",
      entityId: input.id,
      entityLabel: fullName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        {
          firstName: target.firstName,
          middleName: target.middleName,
          lastName: target.lastName,
          genderId: target.genderId,
          mobileNumber: target.mobileNumber,
          personalEmail: target.personalEmail,
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

export async function setTaCandidateStatus(input: {
  id: string;
  requestId: string;
  status: "active" | "rejected" | "withdrawn";
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:edit");

    const [target] = await db.select().from(taCandidate).where(eq(taCandidate.id, input.id)).limit(1);
    if (!target) return { ok: false, error: "That candidate no longer exists." };
    if (target.status === "hired") return { ok: false, error: "This candidate has already been hired." };
    if (target.status === input.status) return { ok: false, error: "That's already this candidate's status." };

    await db.update(taCandidate).set({ status: input.status }).where(eq(taCandidate.id, input.id));

    const fullName = formatEmployeeDisplayName(target);

    await recordAudit({
      module: "ta_candidates",
      action: "candidate_updated",
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

export async function deleteTaCandidate(input: { id: string; requestId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:delete");

    const [target] = await db.select().from(taCandidate).where(eq(taCandidate.id, input.id)).limit(1);
    if (!target) return { ok: false, error: "That candidate no longer exists." };

    const fullName = formatEmployeeDisplayName(target);

    // Cascade deletes the candidate's stage rows and comments — see `taCandidateStage`/`taCandidateComment`'s FKs.
    await db.delete(taCandidate).where(eq(taCandidate.id, input.id));

    if (target.cvStorageKey) await deleteDocumentFile(target.cvStorageKey);

    await recordAudit({
      module: "ta_candidates",
      action: "deleted",
      entityId: input.id,
      entityLabel: fullName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ name: fullName }, null, { name: "Name" }),
    });

    revalidatePath(`/talent-acquisition/${input.requestId}`);
    return { ok: true, data: undefined, message: `${fullName} removed.` };
  });
}

export async function uploadTaCandidateCv(formData: FormData): Promise<ActionResult> {
  return run(async () => {
    if (!isDocumentStorageAvailable()) {
      throw new Error("Document storage isn't available in this environment yet — see docs/DOCUMENTS.md.");
    }

    const candidateId = String(formData.get("candidateId") ?? "");
    const requestId = String(formData.get("requestId") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File)) return { ok: false, error: "No file provided." };
    if (file.size === 0) return { ok: false, error: "That file is empty." };
    if (file.size > MAX_CV_SIZE_BYTES) return { ok: false, error: "CVs must be 10 MB or smaller." };

    const actor = await authorize("talent_acquisition:edit");

    const [target] = await db.select().from(taCandidate).where(eq(taCandidate.id, candidateId)).limit(1);
    if (!target) return { ok: false, error: "That candidate no longer exists." };

    // Replacing an existing CV — clean up the old file once the new one is safely written.
    const previousStorageKey = target.cvStorageKey;

    const fileName = sanitizeDocumentName(file.name);
    const storageKey = buildCandidateCvStorageKey(candidateId, fileName);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await saveDocumentFile(storageKey, bytes);

    await db
      .update(taCandidate)
      .set({ cvStorageKey: storageKey, cvFileName: fileName, cvMimeType: file.type || null, cvSize: file.size })
      .where(eq(taCandidate.id, candidateId));

    if (previousStorageKey && previousStorageKey !== storageKey) await deleteDocumentFile(previousStorageKey);

    const fullName = formatEmployeeDisplayName(target);

    await recordAudit({
      module: "ta_candidates",
      action: "cv_uploaded",
      entityId: candidateId,
      entityLabel: fullName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ cv: target.cvFileName }, { cv: fileName }, { cv: "CV" }),
    });

    revalidatePath(`/talent-acquisition/${requestId}`);
    return { ok: true, data: undefined, message: "CV uploaded." };
  });
}
