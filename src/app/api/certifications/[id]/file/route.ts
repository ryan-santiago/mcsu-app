import { NextResponse } from "next/server";

import { isDocumentStorageAvailable, readDocumentFile } from "@/lib/document-storage";
import { getCurrentUser } from "@/lib/session";
import { getCertificationForDownload } from "@/server/certifications/queries";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The only place a certificate's bytes are ever served from. Never linked to
 * directly with a bare storage path — every request re-checks the caller's
 * session and re-derives access (ownership, or `certifications:read_all`,
 * or admin) via `getCertificationForDownload`, same guarantee One-Lot
 * Project Docs' own download route gives its files.
 * `?download=1` forces a Save dialog; otherwise the browser renders it
 * inline when it can (PDF, images).
 */
export async function GET(request: Request, { params }: RouteContext) {
  if (!isDocumentStorageAvailable()) {
    return NextResponse.json({ error: "Document storage isn't available in this environment." }, { status: 503 });
  }

  const { id } = await params;

  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await getCertificationForDownload(id, actor);
  if (!record || !record.storageKey || !record.fileName) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readDocumentFile(record.storageKey);
  if (!file) {
    return NextResponse.json({ error: "This file is missing from storage." }, { status: 404 });
  }

  const forceDownload = new URL(request.url).searchParams.get("download") === "1";
  const disposition = forceDownload ? "attachment" : "inline";
  const asciiFallback = record.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encodedName = encodeURIComponent(record.fileName);

  return new Response(file.stream, {
    headers: {
      "Content-Type": record.mimeType || "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
    },
  });
}
