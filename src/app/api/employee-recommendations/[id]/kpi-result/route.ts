import { NextResponse } from "next/server";

import { isDocumentStorageAvailable, readDocumentFile } from "@/lib/document-storage";
import { kpiResultStorageKey } from "@/lib/employee-recommendation-document-format";
import { getCurrentUser } from "@/lib/session";
import { fetchRecommendationById } from "@/server/employee-recommendations/actions";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The only place a KPI Result's bytes are ever served from — never linked to
 * directly with a bare storage path. Every request re-checks the caller's
 * session and team scope via `fetchRecommendationById`, same guarantee the
 * One-Lot Docs download route gets from `assertOneLotProjectContentAccess`.
 * `?download=1` forces a Save dialog; otherwise the browser renders the PDF
 * inline.
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
  if (!recommendation || !recommendation.hasKpiResult) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readDocumentFile(kpiResultStorageKey(id));
  if (!file) {
    return NextResponse.json({ error: "This file is missing from storage." }, { status: 404 });
  }

  const forceDownload = new URL(request.url).searchParams.get("download") === "1";
  const disposition = forceDownload ? "attachment" : "inline";
  const fileName = `KPI Result - ${recommendation.employeeName}.pdf`;
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
