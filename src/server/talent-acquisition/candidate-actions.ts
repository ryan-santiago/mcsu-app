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

import { getTaCandidateProfile, listTaCandidatePool } from "./candidate-queries";
import type { TaCandidateProfileRow, TaCandidateRow } from "./candidate-types";

/** A CV doesn't need the 50 MB ceiling project docs get. */
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

/** Gated on `talent_acquisition:write`, not `:read` — only someone adding/editing a candidate needs this picker. */
export async function fetchGenderOptions(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:write");
  return listLookupOptions("gender");
}

/** Server-action entry point for the talent pool page, and for "search existing candidates" when adding one to a request. */
export async function fetchTaCandidatePool(search?: string): Promise<TaCandidateRow[]> {
  return listTaCandidatePool(search);
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
