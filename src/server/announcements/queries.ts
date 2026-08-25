import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { announcement, user } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { AnnouncementRow } from "./types";

const AUTHOR_SELECTION = { id: user.id, name: user.name, image: user.image };

/** Newest announcement date first — ties broken by creation time, so same-day posts keep a stable order. */
export async function listAnnouncements(): Promise<AnnouncementRow[]> {
  await authorize("announcements:read");

  const rows = await db
    .select({
      id: announcement.id,
      announcementDate: announcement.announcementDate,
      type: announcement.type,
      title: announcement.title,
      description: announcement.description,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
      author: AUTHOR_SELECTION,
    })
    .from(announcement)
    .leftJoin(user, eq(announcement.createdBy, user.id))
    .orderBy(desc(announcement.announcementDate), desc(announcement.createdAt));

  return rows.map(({ author, ...row }) => ({
    ...row,
    createdBy: author?.id ? author : null,
  }));
}
