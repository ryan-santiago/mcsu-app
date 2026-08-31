import "server-only";

import { encodeGraphPath, graphFetch, graphJson, isGraphConfigured } from "@/lib/graph-client";

/**
 * SharePoint (Microsoft Graph)-backed storage for One-Lot Project Docs — see
 * docs/DOCUMENTS.md for the path convention (`storageKey` shape) and the
 * design decisions this implementation follows. Every read/write path in
 * this feature (and the Docs UI itself) checks `isDocumentStorageAvailable()`
 * first and refuses rather than silently losing an upload.
 */

const LIBRARY_PREFIX = "Documents/";

/** Graph's simple `PUT .../content` ceiling — above this, an upload session is required. */
const SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** Must be a multiple of 320 KiB per Graph's upload-session contract. */
const UPLOAD_CHUNK_BYTES = 10 * 1024 * 1024;

/** `fetch`'s `BodyInit` accepts `ArrayBuffer` but not a `Uint8Array` typed over a generic `ArrayBufferLike` (which technically admits `SharedArrayBuffer`) — this copies out a real `ArrayBuffer` slice to satisfy that. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function isDocumentStorageAvailable(): boolean {
  if (!isGraphConfigured()) return false;
  if (process.env.SHAREPOINT_SITE_ID) return true;
  return Boolean(process.env.SHAREPOINT_SITE_HOSTNAME && process.env.SHAREPOINT_SITE_PATH);
}

// Best-effort within one warm serverless instance — a cold start just
// re-resolves. Same convention as graph-client.ts's token cache.
let driveCache: { siteId: string; driveId: string } | null = null;

async function resolveDrive(): Promise<{ siteId: string; driveId: string }> {
  if (driveCache) return driveCache;

  const siteId = process.env.SHAREPOINT_SITE_ID || (await resolveSiteId());
  const driveId = await resolveDriveId(siteId);
  driveCache = { siteId, driveId };
  return driveCache;
}

async function resolveSiteId(): Promise<string> {
  const hostname = process.env.SHAREPOINT_SITE_HOSTNAME;
  const sitePath = process.env.SHAREPOINT_SITE_PATH;
  if (!hostname || !sitePath) {
    throw new Error(
      "SharePoint site isn't configured — set SHAREPOINT_SITE_ID, or SHAREPOINT_SITE_HOSTNAME + SHAREPOINT_SITE_PATH.",
    );
  }
  const normalizedPath = sitePath.startsWith("/") ? sitePath : `/${sitePath}`;
  const site = await graphJson<{ id: string }>(`/sites/${hostname}:${normalizedPath}`);
  return site.id;
}

/** Matches by `SHAREPOINT_DRIVE_NAME` (default "Documents") against the site's document libraries; falls back to the site's default drive if no name matches — covers a differently-named default library. */
async function resolveDriveId(siteId: string): Promise<string> {
  const wantedName = (process.env.SHAREPOINT_DRIVE_NAME || "Documents").toLowerCase();
  const { value: drives } = await graphJson<{ value: { id: string; name: string }[] }>(`/sites/${siteId}/drives`);
  const match = drives.find((drive) => drive.name.toLowerCase() === wantedName);
  if (match) return match.id;

  const defaultDrive = await graphJson<{ id: string }>(`/sites/${siteId}/drive`);
  return defaultDrive.id;
}

/**
 * `storageKey` values look like `Documents/One-Lot Project/{projectId}/...`,
 * where `Documents/` represents the library itself. The resolved drive's
 * root IS that library's root, so the leading segment must be stripped
 * before building a Graph-relative path — using the key as-is would create
 * a redundant nested `Documents/` folder inside the `Documents` library.
 */
function toGraphPath(storageKey: string): string {
  return storageKey.startsWith(LIBRARY_PREFIX) ? storageKey.slice(LIBRARY_PREFIX.length) : storageKey;
}

/** Walks `folderPath` one segment at a time, creating each that doesn't already exist. Graph's simple content PUT does NOT auto-create missing intermediate folders, so this runs before every upload. */
async function ensureFoldersExist(driveId: string, folderPath: string): Promise<void> {
  const segments = folderPath.split("/").filter(Boolean);
  let builtPath = "";
  for (const segment of segments) {
    const parentPath = builtPath;
    builtPath = parentPath ? `${parentPath}/${segment}` : segment;
    await createFolderIfMissing(driveId, parentPath, segment);
  }
}

async function createFolderIfMissing(driveId: string, parentPath: string, name: string): Promise<void> {
  const childrenUrl = parentPath
    ? `/drives/${driveId}/root:/${encodeGraphPath(parentPath)}:/children`
    : `/drives/${driveId}/root/children`;

  const response = await graphFetch(childrenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });

  if (response.ok || response.status === 409) return; // 409 nameAlreadyExists — another request created it first
  throw new Error(`Failed to create SharePoint folder "${name}" (${response.status}): ${await response.text()}`);
}

export async function saveDocumentFile(storageKey: string, bytes: Uint8Array): Promise<void> {
  const { driveId } = await resolveDrive();
  const graphPath = toGraphPath(storageKey);
  const lastSlash = graphPath.lastIndexOf("/");
  const folderPath = lastSlash === -1 ? "" : graphPath.slice(0, lastSlash);
  if (folderPath) await ensureFoldersExist(driveId, folderPath);

  if (bytes.byteLength <= SIMPLE_UPLOAD_MAX_BYTES) {
    const response = await graphFetch(`/drives/${driveId}/root:/${encodeGraphPath(graphPath)}:/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: toArrayBuffer(bytes),
    });
    if (!response.ok) {
      throw new Error(`Failed to upload "${storageKey}" to SharePoint (${response.status}): ${await response.text()}`);
    }
    return;
  }

  await uploadLargeFile(driveId, graphPath, bytes);
}

/** Chunked upload for files above `SIMPLE_UPLOAD_MAX_BYTES` — Graph's `uploadUrl` is pre-authenticated, so these chunk PUTs deliberately go through plain `fetch()`, not `graphFetch()` (see graph-client.ts). */
async function uploadLargeFile(driveId: string, graphPath: string, bytes: Uint8Array): Promise<void> {
  const session = await graphJson<{ uploadUrl: string }>(
    `/drives/${driveId}/root:/${encodeGraphPath(graphPath)}:/createUploadSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
    },
  );

  const total = bytes.byteLength;
  for (let start = 0; start < total; start += UPLOAD_CHUNK_BYTES) {
    const end = Math.min(start + UPLOAD_CHUNK_BYTES, total);
    const chunk = bytes.subarray(start, end);
    const response = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${end - 1}/${total}`,
      },
      body: toArrayBuffer(chunk),
    });
    if (!response.ok) {
      throw new Error(`Failed to upload chunk [${start}-${end - 1}] of "${graphPath}" (${response.status}): ${await response.text()}`);
    }
  }
}

export async function deleteDocumentFile(storageKey: string): Promise<void> {
  try {
    const { driveId } = await resolveDrive();
    const graphPath = toGraphPath(storageKey);
    const response = await graphFetch(`/drives/${driveId}/root:/${encodeGraphPath(graphPath)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete "${storageKey}" from SharePoint (${response.status}): ${await response.text()}`);
    }
  } catch (error) {
    // Best-effort - an orphaned file costs storage space, but blocking the
    // DB delete on it would leave a document the user can no longer manage
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
  try {
    const { driveId } = await resolveDrive();
    const graphPath = toGraphPath(storageKey);
    const response = await graphFetch(`/drives/${driveId}/root:/${encodeGraphPath(graphPath)}:/content`);
    if (response.status === 404) return null;
    if (!response.ok || !response.body) {
      throw new Error(`Failed to read "${storageKey}" from SharePoint (${response.status}): ${await response.text()}`);
    }
    const sizeHeader = response.headers.get("content-length");
    return { stream: response.body, size: sizeHeader ? Number(sizeHeader) : 0 };
  } catch (error) {
    console.error("[document-storage] failed to read file", { storageKey, error });
    return null;
  }
}
