import { NextResponse } from "next/server";

import { isDocumentStorageAvailable, readDocumentFile } from "@/lib/document-storage";
import { erfStorageKey } from "@/lib/employee-recommendation-document-format";
import { getCurrentUser } from "@/lib/session";
import { fetchRecommendationById } from "@/server/employee-recommendations/actions";
import { erfFileName } from "@/lib/employee-recommendation-pdf";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The only place a generated ERF's bytes are ever served from — never
 * linked to directly with a bare storage path. Every request re-checks the
 * caller's session and team scope via `fetchRecommendationById`, same
 * pattern as the KPI Result download route.
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

  const recommendation = await fetchRecommendationById(id);
  if (!recommendation || !recommendation.hasErf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readDocumentFile(erfStorageKey(id));
  if (!file) {
    return NextResponse.json({ error: "This file is missing from storage." }, { status: 404 });
  }

  const forceDownload = new URL(request.url).searchParams.get("download") === "1";
  const disposition = forceDownload ? "attachment" : "inline";
  const fileName = erfFileName(recommendation.employeeName);
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encodedName = encodeURIComponent(fileName);

  return new Response(file.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.size),
      "Content-Disposition": `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
    },
  });
}
