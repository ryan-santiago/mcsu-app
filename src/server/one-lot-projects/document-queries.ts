import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { oneLotProjectDocument, user } from "@/db/schema";
import { AuthorizationError, type CurrentUser } from "@/lib/session";

import { assertOneLotProjectContentAccess } from "./queries";
import type { DocumentBreadcrumb, DocumentFolderData, DocumentRow } from "./document-types";

/**
 * A folder's immediate children plus the breadcrumb trail to it — everything
 * the Docs page needs for one screen. Folders sort before files, then both
 * alphabetically, matching Explorer/SharePoint/OneDrive convention.
 */
export async function getOneLotProjectDocumentFolder(
  projectId: string,
  folderId: string | null,
  actor: CurrentUser,
): Promise<DocumentFolderData> {
  await assertOneLotProjectContentAccess(projectId, actor);

  if (folderId) {
    const [folder] = await db
      .select({ id: oneLotProjectDocument.id, projectId: oneLotProjectDocument.projectId })
      .from(oneLotProjectDocument)
      .where(and(eq(oneLotProjectDocument.id, folderId), eq(oneLotProjectDocument.type, "folder")))
      .limit(1);
    if (!folder || folder.projectId !== projectId) throw new AuthorizationError("That folder no longer exists.");
  }

  const [breadcrumbs, rows] = await Promise.all([
    buildBreadcrumbs(folderId),
    db
      .select({
        id: oneLotProjectDocument.id,
        parentId: oneLotProjectDocument.parentId,
        type: oneLotProjectDocument.type,
        name: oneLotProjectDocument.name,
        mimeType: oneLotProjectDocument.mimeType,
        size: oneLotProjectDocument.size,
        uploadedByName: user.name,
        createdAt: oneLotProjectDocument.createdAt,
        updatedAt: oneLotProjectDocument.updatedAt,
      })
      .from(oneLotProjectDocument)
      .leftJoin(user, eq(user.id, oneLotProjectDocument.uploadedBy))
      .where(
        and(
          eq(oneLotProjectDocument.projectId, projectId),
          folderId ? eq(oneLotProjectDocument.parentId, folderId) : isNull(oneLotProjectDocument.parentId),
        ),
      )
      .orderBy(desc(oneLotProjectDocument.type), asc(oneLotProjectDocument.name)),
  ]);

  return { currentFolderId: folderId, breadcrumbs, items: rows };
}

async function buildBreadcrumbs(folderId: string | null): Promise<DocumentBreadcrumb[]> {
  const trail: DocumentBreadcrumb[] = [];
  let currentId = folderId;

  // A document tree is only ever a handful of levels deep in practice, so a
  // walk-one-row-per-level loop is simpler than a recursive CTE and cheap
  // enough not to matter.
  while (currentId) {
    const [row] = await db
      .select({ id: oneLotProjectDocument.id, name: oneLotProjectDocument.name, parentId: oneLotProjectDocument.parentId })
      .from(oneLotProjectDocument)
      .where(eq(oneLotProjectDocument.id, currentId))
      .limit(1);
    if (!row) break;
    trail.unshift({ id: row.id, name: row.name });
    currentId = row.parentId;
  }

  return trail;
}

/** Used by rename/delete/download — confirms the document belongs to this project before anything touches it. */
export async function getOneLotProjectDocumentById(
  projectId: string,
  documentId: string,
  actor: CurrentUser,
): Promise<DocumentRow & { storageKey: string | null }> {
  await assertOneLotProjectContentAccess(projectId, actor);

  const [row] = await db
    .select({
      id: oneLotProjectDocument.id,
      parentId: oneLotProjectDocument.parentId,
      type: oneLotProjectDocument.type,
      name: oneLotProjectDocument.name,
      mimeType: oneLotProjectDocument.mimeType,
      size: oneLotProjectDocument.size,
      storageKey: oneLotProjectDocument.storageKey,
      uploadedByName: user.name,
      createdAt: oneLotProjectDocument.createdAt,
      updatedAt: oneLotProjectDocument.updatedAt,
    })
    .from(oneLotProjectDocument)
    .leftJoin(user, eq(user.id, oneLotProjectDocument.uploadedBy))
    .where(and(eq(oneLotProjectDocument.id, documentId), eq(oneLotProjectDocument.projectId, projectId)))
    .limit(1);

  if (!row) throw new AuthorizationError("That item no longer exists.");
  return row;
}

/** Every file under a folder (recursively) — used to clean up on-disk files when a folder is deleted. */
export async function listDescendantFiles(projectId: string, folderId: string): Promise<{ id: string; storageKey: string | null }[]> {
  const all = await db
    .select({ id: oneLotProjectDocument.id, parentId: oneLotProjectDocument.parentId, type: oneLotProjectDocument.type, storageKey: oneLotProjectDocument.storageKey })
    .from(oneLotProjectDocument)
    .where(eq(oneLotProjectDocument.projectId, projectId));

  const childrenOf = new Map<string, typeof all>();
  for (const row of all) {
    const key = row.parentId ?? "";
    const bucket = childrenOf.get(key) ?? [];
    bucket.push(row);
    childrenOf.set(key, bucket);
  }

  const files: { id: string; storageKey: string | null }[] = [];
  const stack = [folderId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const child of childrenOf.get(id) ?? []) {
      if (child.type === "file") files.push({ id: child.id, storageKey: child.storageKey });
      else stack.push(child.id);
    }
  }
  return files;
}
