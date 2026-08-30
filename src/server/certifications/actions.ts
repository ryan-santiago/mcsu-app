"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { certification } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { buildCertificationStorageKey } from "@/lib/certification-format";
import { deleteDocumentFile, isDocumentStorageAvailable, saveDocumentFile } from "@/lib/document-storage";
import { authorize, AuthorizationError } from "@/lib/session";
import { certificationFormSchema } from "@/lib/validation/certification";
import { listActiveEmployeeOptions } from "@/server/employees/queries";
import type { EmployeeOption } from "@/server/employees/types";
import { requireActiveUser } from "@/server/settings/queries";

import {
  getMyCertificationById,
  listCertificationsForMonitoring,
  listCertificationsForMonitoringExport,
  listMyCertifications,
  MONITORING_EXPORT_ROW_LIMIT,
} from "./queries";
import type {
  CertificationDetail,
  CertificationFilters,
  CertificationListResult,
  CertificationMonitoringFilters,
  CertificationMonitoringListResult,
  CertificationMonitoringRow,
} from "./types";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const idSchema = z.string().min(1, "A certification must be selected");

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[certifications] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshMyCertifications(id?: string) {
  revalidatePath("/certifications");
  if (id) revalidatePath(`/certifications/${id}`);
}

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

export async function fetchMyCertifications(filters: CertificationFilters): Promise<CertificationListResult> {
  return listMyCertifications(filters);
}

export async function fetchMyCertification(id: string): Promise<CertificationDetail | null> {
  return getMyCertificationById(id);
}

/* -------------------------------------------------------------------------- */
/*  Monitoring — requires `certifications:read_all`, see queries.ts          */
/* -------------------------------------------------------------------------- */

export async function fetchCertificationsForMonitoring(
  filters: CertificationMonitoringFilters,
): Promise<ActionResult<CertificationMonitoringListResult>> {
  return run(async () => {
    const data = await listCertificationsForMonitoring(filters);
    return { ok: true, data, message: "" };
  });
}

export async function fetchCertificationsForMonitoringExport(
  filters: Omit<CertificationMonitoringFilters, "page" | "pageSize">,
): Promise<ActionResult<{ rows: CertificationMonitoringRow[] }>> {
  return run(async () => {
    const rows = await listCertificationsForMonitoringExport(filters);
    if (rows.length > MONITORING_EXPORT_ROW_LIMIT) {
      return { ok: false, error: "That range has too many rows to export at once — narrow it and try again." };
    }
    return { ok: true, data: { rows }, message: "" };
  });
}

export async function fetchCertificationMonitoringEmployeeOptions(): Promise<
  ActionResult<{ options: EmployeeOption[] }>
> {
  return run(async () => {
    await authorize("certifications:read_all");
    return { ok: true, data: { options: await listActiveEmployeeOptions() }, message: "" };
  });
}

/* -------------------------------------------------------------------------- */
/*  Write                                                                     */
/* -------------------------------------------------------------------------- */

export async function createMyCertification(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await requireActiveUser();
    if (!actor.employeeId) return { ok: false, error: "Your account has no linked employee record." };

    const data = certificationFormSchema.parse({
      title: formData.get("title"),
      dateAcquired: formData.get("dateAcquired"),
      credentialUrl: formData.get("credentialUrl") ?? "",
    });
    const file = formData.get("file");
    const hasFile = file instanceof File && file.size > 0;

    if (!data.credentialUrl && !hasFile) {
      return { ok: false, error: "Add a certificate URL, an uploaded file, or both." };
    }
    if (hasFile && (file as File).size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: "Files must be 50 MB or smaller." };
    }
    if (hasFile && !isDocumentStorageAvailable()) {
      return {
        ok: false,
        error: "File upload isn't available in this environment yet — you can still save this record with just a URL.",
      };
    }

    const id = crypto.randomUUID();
    let storageKey: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;

    if (hasFile) {
      const uploaded = file as File;
      storageKey = buildCertificationStorageKey(actor.employeeId, id, uploaded.name);
      await saveDocumentFile(storageKey, new Uint8Array(await uploaded.arrayBuffer()));
      fileName = uploaded.name;
      mimeType = uploaded.type || null;
      fileSize = uploaded.size;
    }

    await db.insert(certification).values({
      id,
      employeeId: actor.employeeId,
      title: data.title,
      dateAcquired: data.dateAcquired,
      credentialUrl: data.credentialUrl || null,
      storageKey,
      fileName,
      mimeType,
      fileSize,
    });

    await recordAudit({
      module: "certifications",
      action: "created",
      entityId: id,
      entityLabel: data.title,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { title: data.title, dateAcquired: data.dateAcquired }, { title: "Title", dateAcquired: "Date acquired" }),
    });

    refreshMyCertifications(id);
    return { ok: true, data: { id }, message: "Certification added." };
  });
}

export async function updateMyCertification(formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActiveUser();
    if (!actor.employeeId) return { ok: false, error: "Your account has no linked employee record." };

    const id = idSchema.parse(formData.get("id"));
    const data = certificationFormSchema.parse({
      title: formData.get("title"),
      dateAcquired: formData.get("dateAcquired"),
      credentialUrl: formData.get("credentialUrl") ?? "",
    });
    /** "keep" (default) leaves any existing file untouched; "replace" swaps it for a new upload; "remove" drops it entirely. */
    const fileAction = String(formData.get("fileAction") ?? "keep");
    const file = formData.get("file");
    const hasNewFile = fileAction === "replace" && file instanceof File && file.size > 0;

    const [existing] = await db
      .select()
      .from(certification)
      .where(and(eq(certification.id, id), eq(certification.employeeId, actor.employeeId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That certification no longer exists." };

    const willHaveFile = fileAction === "remove" ? false : hasNewFile ? true : Boolean(existing.storageKey);
    if (!data.credentialUrl && !willHaveFile) {
      return { ok: false, error: "Add a certificate URL, an uploaded file, or both." };
    }
    if (hasNewFile && (file as File).size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: "Files must be 50 MB or smaller." };
    }
    if (hasNewFile && !isDocumentStorageAvailable()) {
      return { ok: false, error: "File upload isn't available in this environment yet." };
    }

    let storageKey = existing.storageKey;
    let fileName = existing.fileName;
    let mimeType = existing.mimeType;
    let fileSize = existing.fileSize;

    if (fileAction === "remove" || hasNewFile) {
      if (existing.storageKey) await deleteDocumentFile(existing.storageKey);
      storageKey = null;
      fileName = null;
      mimeType = null;
      fileSize = null;
    }

    if (hasNewFile) {
      const uploaded = file as File;
      storageKey = buildCertificationStorageKey(actor.employeeId, id, uploaded.name);
      await saveDocumentFile(storageKey, new Uint8Array(await uploaded.arrayBuffer()));
      fileName = uploaded.name;
      mimeType = uploaded.type || null;
      fileSize = uploaded.size;
    }

    await db
      .update(certification)
      .set({
        title: data.title,
        dateAcquired: data.dateAcquired,
        credentialUrl: data.credentialUrl || null,
        storageKey,
        fileName,
        mimeType,
        fileSize,
      })
      .where(eq(certification.id, id));

    await recordAudit({
      module: "certifications",
      action: "updated",
      entityId: id,
      entityLabel: data.title,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { title: existing.title, dateAcquired: existing.dateAcquired, credentialUrl: existing.credentialUrl },
        { title: data.title, dateAcquired: data.dateAcquired, credentialUrl: data.credentialUrl || null },
        { title: "Title", dateAcquired: "Date acquired", credentialUrl: "Credential URL" },
      ),
    });

    refreshMyCertifications(id);
    return { ok: true, data: undefined, message: "Certification updated." };
  });
}

export async function deleteMyCertification(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActiveUser();
    if (!actor.employeeId) return { ok: false, error: "Your account has no linked employee record." };
    const id = idSchema.parse(input.id);

    const [existing] = await db
      .select()
      .from(certification)
      .where(and(eq(certification.id, id), eq(certification.employeeId, actor.employeeId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That certification no longer exists." };

    await recordAudit({
      module: "certifications",
      action: "deleted",
      entityId: id,
      entityLabel: existing.title,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ title: existing.title }, null, { title: "Title" }),
    });

    if (existing.storageKey) await deleteDocumentFile(existing.storageKey);
    await db.delete(certification).where(eq(certification.id, id));

    refreshMyCertifications();
    return { ok: true, data: undefined, message: "Certification removed." };
  });
}
