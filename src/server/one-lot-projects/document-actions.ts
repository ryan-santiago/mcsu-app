"use server";

import { and, eq, ilike, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { oneLotProjectDocument } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { deleteDocumentFile, isDocumentStorageAvailable, saveDocumentFile } from "@/lib/document-storage";
import { buildDocumentStorageKey } from "@/lib/one-lot-project-document-format";
import { AuthorizationError, authorizeActiveUser } from "@/lib/session";

import { getOneLotProjectDocumentById, getOneLotProjectDocumentFolder, listDescendantFiles } from "./document-queries";
import type { DocumentFolderData } from "./document-types";
import { assertOneLotProjectContentAccess } from "./queries";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const documentNameSchema = z.string().trim().min(1, "Required").max(200, "That's too long");

function revalidateDocuments(projectId: string) {
  revalidatePath(`/one-lot-projects/${projectId}/documents`);
}

// ---------------------------------------------------------------------------
// Fetch wrapper — document-queries.ts is server-only, so the client
// component (useQuery, navigating between folders) calls this instead.
// ---------------------------------------------------------------------------

export async function fetchOneLotProjectDocumentFolder(
  projectId: string,
  folderId: string | null,
): Promise<DocumentFolderData> {
  const actor = await authorizeActiveUser();
  return getOneLotProjectDocumentFolder(projectId, folderId, actor);
}

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[one-lot-projects/documents] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function assertStorageAvailable() {
  if (!isDocumentStorageAvailable()) {
    throw new Error("Document storage isn't available in this environment yet — see docs/DOCUMENTS.md.");
  }
}

async function assertNameAvailable(projectId: string, parentId: string | null, name: string, excludeId?: string) {
  const [existing] = await db
    .select({ id: oneLotProjectDocument.id })
    .from(oneLotProjectDocument)
    .where(
      and(
        eq(oneLotProjectDocument.projectId, projectId),
        parentId ? eq(oneLotProjectDocument.parentId, parentId) : isNull(oneLotProjectDocument.parentId),
        ilike(oneLotProjectDocument.name, name),
        ...(excludeId ? [ne(oneLotProjectDocument.id, excludeId)] : []),
      ),
    )
    .limit(1);
  if (existing) throw new Error(`"${name}" already exists here.`);
}

export async function createOneLotProjectDocumentFolder(input: {
  projectId: string;
  parentId: string | null;
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    assertStorageAvailable();
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);
    const name = documentNameSchema.parse(input.name);

    await assertNameAvailable(input.projectId, input.parentId, name);

    const id = crypto.randomUUID();
    await db.insert(oneLotProjectDocument).values({
      id,
      projectId: input.projectId,
      parentId: input.parentId,
      type: "folder",
      name,
      uploadedBy: actor.id,
    });

    await recordAudit({
      module: "one_lot_projects",
      action: "document_folder_created",
      entityId: input.projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { item: name }, { item: "Folder" }),
    });

    revalidateDocuments(input.projectId);
    return { ok: true, data: { id }, message: `"${name}" folder created.` };
  });
}

export async function uploadOneLotProjectDocument(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    assertStorageAvailable();

    const projectId = String(formData.get("projectId") ?? "");
    const parentIdRaw = formData.get("parentId");
    const parentId = parentIdRaw ? String(parentIdRaw) : null;
    const file = formData.get("file");

    if (!(file instanceof File)) return { ok: false, error: "No file provided." };
    if (file.size === 0) return { ok: false, error: "That file is empty." };
    if (file.size > MAX_FILE_SIZE_BYTES) return { ok: false, error: "Files must be 50 MB or smaller." };

    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(projectId, actor);
    const name = documentNameSchema.parse(file.name);

    await assertNameAvailable(projectId, parentId, name);

    const id = crypto.randomUUID();
    const storageKey = buildDocumentStorageKey(projectId, id, name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await saveDocumentFile(storageKey, bytes);

    await db.insert(oneLotProjectDocument).values({
      id,
      projectId,
      parentId,
      type: "file",
      name,
      storageKey,
      mimeType: file.type || null,
      size: file.size,
      uploadedBy: actor.id,
    });

    await recordAudit({
      module: "one_lot_projects",
      action: "document_uploaded",
      entityId: projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { item: name }, { item: "Document" }),
    });

    revalidateDocuments(projectId);
    return { ok: true, data: { id }, message: `"${name}" uploaded.` };
  });
}

export async function renameOneLotProjectDocument(input: {
  projectId: string;
  id: string;
  name: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);
    const name = documentNameSchema.parse(input.name);

    const before = await getOneLotProjectDocumentById(input.projectId, input.id, actor);
    await assertNameAvailable(input.projectId, before.parentId, name, input.id);

    await db
      .update(oneLotProjectDocument)
      .set({ name })
      .where(and(eq(oneLotProjectDocument.id, input.id), eq(oneLotProjectDocument.projectId, input.projectId)));

    const fieldChanges = diffFields(
      { name: before.name },
      { name },
      { name: before.type === "folder" ? "Folder name" : "File name" },
    );
    if (fieldChanges.length > 0) {
      await recordAudit({
        module: "one_lot_projects",
        action: "document_renamed",
        entityId: input.projectId,
        entityLabel: project.name,
        actorId: actor.id,
        actorEmail: actor.email,
        changes: fieldChanges,
      });
    }

    revalidateDocuments(input.projectId);
    return { ok: true, data: undefined, message: `Renamed to "${name}".` };
  });
}

/** True if `candidateAncestorId` is `folderId` itself or one of its ancestors — walked via the `parentId` chain. Guards against moving a folder into itself or one of its own descendants, which would orphan it. */
async function isSelfOrAncestor(projectId: string, folderId: string, candidateAncestorId: string | null): Promise<boolean> {
  let currentId = candidateAncestorId;
  while (currentId) {
    if (currentId === folderId) return true;
    const [row] = await db
      .select({ parentId: oneLotProjectDocument.parentId })
      .from(oneLotProjectDocument)
      .where(and(eq(oneLotProjectDocument.id, currentId), eq(oneLotProjectDocument.projectId, projectId)))
      .limit(1);
    currentId = row?.parentId ?? null;
  }
  return false;
}

export async function moveOneLotProjectDocument(input: {
  projectId: string;
  id: string;
  targetParentId: string | null;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);

    const target = await getOneLotProjectDocumentById(input.projectId, input.id, actor);
    if (input.targetParentId === target.parentId) {
      return { ok: true, data: undefined, message: `"${target.name}" is already there.` };
    }

    if (input.targetParentId) {
      if (target.type === "folder" && (await isSelfOrAncestor(input.projectId, target.id, input.targetParentId))) {
        throw new Error("Can't move a folder into itself or one of its subfolders.");
      }
      const destination = await getOneLotProjectDocumentById(input.projectId, input.targetParentId, actor);
      if (destination.type !== "folder") throw new Error("That destination isn't a folder.");
    }

    await assertNameAvailable(input.projectId, input.targetParentId, target.name, input.id);

    await db
      .update(oneLotProjectDocument)
      .set({ parentId: input.targetParentId })
      .where(and(eq(oneLotProjectDocument.id, input.id), eq(oneLotProjectDocument.projectId, input.projectId)));

    await recordAudit({
      module: "one_lot_projects",
      action: "document_moved",
      entityId: input.projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { item: target.name }, { item: target.type === "folder" ? "Folder" : "Document" }),
    });

    revalidateDocuments(input.projectId);
    return { ok: true, data: undefined, message: `"${target.name}" moved.` };
  });
}

export async function deleteOneLotProjectDocument(input: { projectId: string; id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);

    const target = await getOneLotProjectDocumentById(input.projectId, input.id, actor);

    const filesToClean =
      target.type === "folder"
        ? await listDescendantFiles(input.projectId, input.id)
        : [{ id: target.id, storageKey: target.storageKey }];

    await db.delete(oneLotProjectDocument).where(eq(oneLotProjectDocument.id, input.id));

    await Promise.all(
      filesToClean
        .filter((f): f is { id: string; storageKey: string } => Boolean(f.storageKey))
        .map((f) => deleteDocumentFile(f.storageKey)),
    );

    await recordAudit({
      module: "one_lot_projects",
      action: "document_deleted",
      entityId: input.projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { item: target.name },
        null,
        { item: target.type === "folder" ? "Folder" : "Document" },
      ),
    });

    revalidateDocuments(input.projectId);
    return {
      ok: true,
      data: undefined,
      message: `"${target.name}" ${target.type === "folder" ? "folder " : ""}deleted.`,
    };
  });
}
