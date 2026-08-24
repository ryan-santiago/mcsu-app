import "server-only";

import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

/**
 * Root directory for every locally-stored document — deliberately OUTSIDE
 * Next.js's `public/` directory. `public/` is served statically with no
 * auth check at all, so anyone who guessed or shared a document's path
 * would bypass this app's RBAC entirely; keeping the real files here means
 * the only way to reach one is through the authenticated download route
 * handler (`src/app/api/one-lot-projects/[id]/documents/[documentId]/route.ts`),
 * which re-checks project access on every request.
 */
const STORAGE_ROOT = path.join(process.cwd(), "storage");

/**
 * Local disk only survives on a persistent filesystem (self-hosted, EC2) —
 * never on this app's current Vercel deployment, whose serverless functions
 * don't persist writes between requests or across instances. Every
 * read/write path in this module (and the Docs UI itself) checks this first
 * and refuses rather than silently losing a user's upload. See
 * docs/DOCUMENTS.md for the full reasoning and the SharePoint migration plan
 * this is standing in for.
 */
export function isDocumentStorageAvailable(): boolean {
  return !process.env.VERCEL;
}

/** Resolves a stored key to an absolute path, refusing anything that would escape `STORAGE_ROOT` — the actual defense against path traversal, on top of `sanitizeDocumentName` upstream already stripping separators from user-typed names. */
function resolveStoragePath(storageKey: string): string {
  const resolved = path.resolve(STORAGE_ROOT, storageKey);
  if (resolved !== STORAGE_ROOT && !resolved.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error("Invalid storage key.");
  }
  return resolved;
}

export async function saveDocumentFile(storageKey: string, bytes: Uint8Array): Promise<void> {
  const fullPath = resolveStoragePath(storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
}

export async function deleteDocumentFile(storageKey: string): Promise<void> {
  try {
    await rm(resolveStoragePath(storageKey), { force: true });
  } catch (error) {
    // Best-effort - an orphaned file costs disk space, but blocking the DB
    // delete on it would leave a document the user can no longer manage
    // stuck in their tree. Same "never block the user-visible action on a
    // cleanup step" convention as recordAudit().
    console.error("[document-storage] failed to delete file", { storageKey, error });
  }
}

export type DocumentFileStream = {
  stream: ReadableStream;
  size: number;
};

/** Streams a document's bytes server-side for the authenticated download route handler - never exposed to the client as a direct path. */
export async function readDocumentFile(storageKey: string): Promise<DocumentFileStream | null> {
  const fullPath = resolveStoragePath(storageKey);
  try {
    const stats = await stat(fullPath);
    if (!stats.isFile()) return null;
    const nodeStream = createReadStream(fullPath);
    return { stream: Readable.toWeb(nodeStream) as ReadableStream, size: stats.size };
  } catch {
    return null;
  }
}
