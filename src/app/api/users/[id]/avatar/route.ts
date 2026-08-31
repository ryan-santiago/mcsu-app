import { NextResponse } from "next/server";

import { isDocumentStorageAvailable, readDocumentFile } from "@/lib/document-storage";
import { getCurrentUser } from "@/lib/session";
import { getUserAvatarById } from "@/server/users/queries";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Serves a user's profile picture. Unlike every other document route in this
 * app (certifications, CVs, One-Lot Project docs), there's no per-record
 * ownership/permission check beyond being signed in and active — avatars
 * aren't sensitive the way those documents are, so any active user may view
 * any other's.
 *
 * `Cache-Control` deliberately allows caching (unlike the `no-store` those
 * other routes use): avatars render dozens of times per page across tables,
 * pickers and cards, so a fresh Graph round-trip per `<img>` per render
 * would be wasteful.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  if (!isDocumentStorageAvailable()) {
    return NextResponse.json({ error: "Document storage isn't available in this environment." }, { status: 503 });
  }

  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const avatar = await getUserAvatarById(id);
  if (!avatar) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readDocumentFile(avatar.avatarStorageKey);
  if (!file) {
    return NextResponse.json({ error: "This file is missing from storage." }, { status: 404 });
  }

  return new Response(file.stream, {
    headers: {
      "Content-Type": avatar.avatarMimeType || "application/octet-stream",
      "Content-Length": String(file.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
