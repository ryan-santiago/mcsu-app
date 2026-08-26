"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { notificationRead } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { authorizeActiveUser, AuthorizationError } from "@/lib/session";

import { listNotifications } from "./queries";
import type { NotificationItem } from "./types";

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[notifications] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  return listNotifications();
}

const markReadSchema = z.object({
  module: z.string().min(1),
  entityId: z.string().min(1),
});

/** Marks one notification seen for the current viewer — idempotent, upserts nothing twice. */
export async function markNotificationRead(input: { module: string; entityId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const values = markReadSchema.parse(input);

    const [existing] = await db
      .select({ id: notificationRead.id })
      .from(notificationRead)
      .where(
        and(
          eq(notificationRead.userId, actor.id),
          eq(notificationRead.module, values.module),
          eq(notificationRead.entityId, values.entityId),
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(notificationRead).values({
        id: crypto.randomUUID(),
        userId: actor.id,
        module: values.module,
        entityId: values.entityId,
      });
    }

    return { ok: true, data: undefined, message: "" };
  });
}

/** Marks every currently-unread notification seen in one round trip — used when the bell panel opens. */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const items = await listNotifications();
    const unread = items.filter((item) => !item.read);

    if (unread.length > 0) {
      await db.insert(notificationRead).values(
        unread.map((item) => ({
          id: crypto.randomUUID(),
          userId: actor.id,
          module: item.module,
          entityId: item.entityId,
        })),
      );
    }

    return { ok: true, data: undefined, message: "" };
  });
}
