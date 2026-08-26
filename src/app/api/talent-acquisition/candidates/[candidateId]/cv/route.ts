import { NextResponse } from "next/server";

import { isDocumentStorageAvailable, readDocumentFile } from "@/lib/document-storage";
import { AuthorizationError, authorize } from "@/lib/session";
import { getTaCandidateCvFile } from "@/server/talent-acquisition/candidate-queries";

type RouteContext = { params: Promise<{ candidateId: string }> };

/**
 * The only place a candidate's CV bytes are ever served from — never linked
 * to directly with a bare storage path. Mirrors
 * `src/app/api/one-lot-projects/[id]/documents/[documentId]/route.ts`, but
 * gated on the blanket `talent_acquisition:read` permission rather than
 * per-record project membership, since this module has no such scoping.
 */
export async function GET(request: Request, { params }: RouteContext) {
  if (!isDocumentStorageAvailable()) {
    return NextResponse.json({ error: "Document storage isn't available in this environment." }, { status: 503 });
  }

  try {
    await authorize("talent_acquisition:read");
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { candidateId } = await params;

  const candidate = await getTaCandidateCvFile(candidateId);
  if (!candidate || !candidate.cvStorageKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readDocumentFile(candidate.cvStorageKey);
  if (!file) {
    return NextResponse.json({ error: "This file is missing from storage." }, { status: 404 });
  }

  const forceDownload = new URL(request.url).searchParams.get("download") === "1";
  const disposition = forceDownload ? "attachment" : "inline";
  const fileName = candidate.cvFileName ?? "cv";
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encodedName = encodeURIComponent(fileName);

  return new Response(file.stream, {
    headers: {
      "Content-Type": candidate.cvMimeType || "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
    },
  });
}
