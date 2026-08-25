"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { announcement } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { sanitizeDescriptionHtml } from "@/lib/sanitize-html";
import { AuthorizationError, authorize } from "@/lib/session";

import { listAnnouncements } from "./queries";
import { ANNOUNCEMENT_TYPES, type AnnouncementRow } from "./types";

const idSchema = z.string().min(1, "An announcement must be selected");

const announcementInputSchema = z.object({
  announcementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
  type: z.enum(ANNOUNCEMENT_TYPES as [string, ...string[]]),
  title: z.string().trim().min(1, "Title is required").max(200, "That title is too long"),
  description: z.string().optional(),
});

const CHANGE_LABELS = {
  announcementDate: "Announcement date",
  type: "Type",
  title: "Title",
  description: "Description",
};

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[announcements] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshAnnouncementsView() {
  revalidatePath("/announcements");
}

/** Server-action entry point for the Announcements board's TanStack Query `queryFn`. */
export async function fetchAnnouncements(): Promise<AnnouncementRow[]> {
  return listAnnouncements();
}

export async function createAnnouncement(input: {
  announcementDate: string;
  type: string;
  title: string;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("announcements:write");
    const values = announcementInputSchema.parse(input);
    const description = values.description ? sanitizeDescriptionHtml(values.description) || null : null;

    const id = crypto.randomUUID();
    await db.insert(announcement).values({
      id,
      announcementDate: values.announcementDate,
      type: values.type as AnnouncementRow["type"],
      title: values.title,
      description,
      createdBy: actor.id,
    });

    await recordAudit({
      module: "announcements",
      action: "created",
      entityId: id,
      entityLabel: values.title,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { announcementDate: values.announcementDate, type: values.type, title: values.title, description },
        CHANGE_LABELS,
      ),
    });

    refreshAnnouncementsView();
    return { ok: true, data: { id }, message: `Announcement "${values.title}" posted.` };
  });
}

export async function updateAnnouncement(input: {
  id: string;
  announcementDate: string;
  type: string;
  title: string;
  description?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("announcements:edit");
    const id = idSchema.parse(input.id);
    const values = announcementInputSchema.parse(input);
    const description = values.description ? sanitizeDescriptionHtml(values.description) || null : null;

    const [target] = await db.select().from(announcement).where(eq(announcement.id, id)).limit(1);
    if (!target) return { ok: false, error: "That announcement no longer exists." };

    await db
      .update(announcement)
      .set({
        announcementDate: values.announcementDate,
        type: values.type as AnnouncementRow["type"],
        title: values.title,
        description,
      })
      .where(eq(announcement.id, id));

    await recordAudit({
      module: "announcements",
      action: "updated",
      entityId: id,
      entityLabel: values.title,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        {
          announcementDate: target.announcementDate,
          type: target.type,
          title: target.title,
          description: target.description,
        },
        { announcementDate: values.announcementDate, type: values.type, title: values.title, description },
        CHANGE_LABELS,
      ),
    });

    refreshAnnouncementsView();
    return { ok: true, data: undefined, message: `Announcement "${values.title}" updated.` };
  });
}

export async function deleteAnnouncement(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("announcements:delete");
    const id = idSchema.parse(input.id);

    const [target] = await db.select().from(announcement).where(eq(announcement.id, id)).limit(1);
    if (!target) return { ok: false, error: "That announcement no longer exists." };

    await recordAudit({
      module: "announcements",
      action: "deleted",
      entityId: id,
      entityLabel: target.title,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ title: target.title }, null, { title: "Title" }),
    });

    await db.delete(announcement).where(eq(announcement.id, id));

    refreshAnnouncementsView();
    return { ok: true, data: undefined, message: `Announcement "${target.title}" removed.` };
  });
}
