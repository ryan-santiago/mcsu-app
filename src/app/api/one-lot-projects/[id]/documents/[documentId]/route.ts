import { NextResponse } from "next/server";

import { isDocumentStorageAvailable, readDocumentFile } from "@/lib/document-storage";
import { getCurrentUser } from "@/lib/session";
import { getOneLotProjectDocumentById } from "@/server/one-lot-projects/document-queries";

type RouteContext = { params: Promise<{ id: string; documentId: string }> };

/**
 * The only place a document's bytes are ever served from. Never linked to
 * directly with a bare storage path — every request re-checks the caller's
 * session and project content access, same guarantee the rest of this
 * module gets from `assertOneLotProjectContentAccess` on the page/action
 * side. `?download=1` forces a Save dialog; otherwise the browser renders
 * it inline when it can (PDF, images, text).
 */
export async function GET(request: Request, { params }: RouteContext) {
  if (!isDocumentStorageAvailable()) {
    return NextResponse.json({ error: "Document storage isn't available in this environment." }, { status: 503 });
  }

  const { id: projectId, documentId } = await params;

  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let document: Awaited<ReturnType<typeof getOneLotProjectDocumentById>>;
  try {
    document = await getOneLotProjectDocumentById(projectId, documentId, actor);
  } catch {
    // Covers both "doesn't exist" and "no content access" — same
    // not-found-either-way convention `getOneLotProjectById` uses, so a
    // document's existence isn't leaked to someone who can't see it.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (document.type !== "file" || !document.storageKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readDocumentFile(document.storageKey);
  if (!file) {
    return NextResponse.json({ error: "This file is missing from storage." }, { status: 404 });
  }

  const forceDownload = new URL(request.url).searchParams.get("download") === "1";
  const disposition = forceDownload ? "attachment" : "inline";
  const asciiFallback = document.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encodedName = encodeURIComponent(document.name);

  return new Response(file.stream, {
    headers: {
      "Content-Type": document.mimeType || "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
    },
  });
}
