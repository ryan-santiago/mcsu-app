"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { taCandidate } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { deleteDocumentFile, isDocumentStorageAvailable, saveDocumentFile } from "@/lib/document-storage";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { sanitizeDocumentName } from "@/lib/one-lot-project-document-format";
import { AuthorizationError, authorize } from "@/lib/session";
import { listLookupOptions } from "@/server/maintenance/queries";
import type { LookupOption } from "@/server/maintenance/types";

import { getTaCandidateProfile, listTaCandidatePool, listTaCandidatesPage } from "./candidate-queries";
import type { TaCandidateFilters, TaCandidatePoolResult, TaCandidateProfileRow, TaCandidateRow } from "./candidate-types";

/**
 * A CV doesn't need the 50 MB ceiling project docs get. Not exported: a
 * `"use server"` file may only export async functions — every export
 * becomes a callable server reference, and a plain constant breaks module
 * evaluation for the whole file (confirmed the hard way: it 500'd every
 * page and action in this file). `application-actions.ts` keeps its own
 * copy rather than importing this one.
 */
const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024;

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

/**
 * The write path every CV attachment goes through — a brand-new candidate
 * (no previous file) or a replace on an existing one. Pulled out once a
 * second caller (`createTaCandidate`) needed the exact same storage-key
 * build → save → column update → clean-up-the-old-one sequence
 * `uploadTaCandidateCv` already had.
 */
export async function attachCandidateCv(
  candidateId: string,
  file: File,
  previousStorageKey: string | null,
): Promise<{ fileName: string }> {
  const fileName = sanitizeDocumentName(file.name);
  const storageKey = buildCandidateCvStorageKey(candidateId, fileName);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await saveDocumentFile(storageKey, bytes);

  await db
    .update(taCandidate)
    .set({ cvStorageKey: storageKey, cvFileName: fileName, cvMimeType: file.type || null, cvSize: file.size })
    .where(eq(taCandidate.id, candidateId));

  if (previousStorageKey && previousStorageKey !== storageKey) await deleteDocumentFile(previousStorageKey);

  return { fileName };
}

/** Gated on `talent_acquisition:write`, not `:read` — only someone adding/editing a candidate needs this picker. */
export async function fetchGenderOptions(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:write");
  return listLookupOptions("gender");
}

/** For the talent pool list's Source filter — gated on `:read` since it's a viewing-time filter, not a write-time picker. */
export async function fetchJobPostingSourceOptions(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:read");
  return listLookupOptions("job_posting_source");
}

/** Server-action entry point for "search existing candidates" when adding one to a request — see `listTaCandidatePool`'s own comment for why this stays separate from the full paginated list below. */
export async function fetchTaCandidatePool(search?: string): Promise<TaCandidateRow[]> {
  return listTaCandidatePool(search);
}

/** Server-action entry point for the talent pool page's paginated, filterable list. */
export async function fetchTaCandidatesPage(filters: TaCandidateFilters): Promise<TaCandidatePoolResult> {
  return listTaCandidatesPage(filters);
}

/** Server-action entry point for the candidate profile page's TanStack Query `queryFn`. */
export async function fetchTaCandidateProfile(candidateId: string): Promise<TaCandidateProfileRow | null> {
  return getTaCandidateProfile(candidateId);
}

/** CV lives on the talent-pool person record, not the application — a returning candidate's re-upload replaces what was on file. */
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

    const { fileName } = await attachCandidateCv(candidateId, file, target.cvStorageKey);
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

    revalidatePath(`/talent-acquisition/candidates/${candidateId}`);
    if (requestId) revalidatePath(`/talent-acquisition/${requestId}`);
    return { ok: true, data: undefined, message: "CV uploaded." };
  });
}

const createCandidateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100, "That's too long"),
  middleName: z.string().optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(100, "That's too long"),
  genderId: z.string().optional(),
  mobileNumber: z.string().optional(),
  personalEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
});

/** Adds someone straight to the talent pool, independent of any request — the standalone Candidates page's "Add candidate," unlike `createTaApplication`, which always creates a request-linked application alongside the candidate. Accepts an optional CV in the same step, reusing `attachCandidateCv` — creating with a file is one `write`-gated action; replacing one on an existing candidate stays `edit`-gated via `uploadTaCandidateCv`. */
export async function createTaCandidate(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:write");

    const values = createCandidateSchema.parse({
      firstName: String(formData.get("firstName") ?? ""),
      middleName: formData.get("middleName") ? String(formData.get("middleName")) : undefined,
      lastName: String(formData.get("lastName") ?? ""),
      genderId: formData.get("genderId") ? String(formData.get("genderId")) : undefined,
      mobileNumber: formData.get("mobileNumber") ? String(formData.get("mobileNumber")) : undefined,
      personalEmail: formData.get("personalEmail") ? String(formData.get("personalEmail")) : undefined,
    });

    const file = formData.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (hasFile && file.size > MAX_CV_SIZE_BYTES) return { ok: false, error: "CVs must be 10 MB or smaller." };
    if (hasFile && !isDocumentStorageAvailable()) {
      return { ok: false, error: "File upload isn't available in this environment yet — you can still add this candidate without a CV." };
    }

    const candidateId = crypto.randomUUID();
    const middleName = values.middleName?.trim() || null;
    const mobileNumber = values.mobileNumber?.trim() || null;
    const personalEmail = values.personalEmail?.trim() || null;
    const genderId = values.genderId || null;

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

    const cvFileName = hasFile ? (await attachCandidateCv(candidateId, file, null)).fileName : null;
    const fullName = formatEmployeeDisplayName(values);

    await recordAudit({
      module: "ta_candidates",
      action: "candidate_added",
      entityId: candidateId,
      entityLabel: fullName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { firstName: values.firstName, middleName, lastName: values.lastName, genderId, mobileNumber, personalEmail, cv: cvFileName },
        {
          firstName: "First name",
          middleName: "Middle name",
          lastName: "Last name",
          genderId: "Gender",
          mobileNumber: "Mobile number",
          personalEmail: "Personal email",
          cv: "CV",
        },
      ),
    });

    revalidatePath("/talent-acquisition/candidates");
    return { ok: true, data: { id: candidateId }, message: `${fullName} added to the talent pool.` };
  });
}
