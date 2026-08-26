import "server-only";

import { count, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { notificationRead, user } from "@/db/schema";
import { can } from "@/lib/rbac";
import { getCurrentUser, type CurrentUser } from "@/lib/session";

import type { NotificationItem } from "./types";

/**
 * Sources are plain functions from actor to unread-agnostic items — adding a
 * module's notifications later (per AGENTS.md's note that this starts scoped
 * to User Management only) is adding one more function here, not touching
 * the bell, the read-tracking table, or `countPendingUserApprovals()` below.
 */
type NotificationSource = (actor: CurrentUser) => Promise<Array<Omit<NotificationItem, "read">>>;

async function pendingUserSource(actor: CurrentUser): Promise<Array<Omit<NotificationItem, "read">>> {
  // Same permission that gates the Approve/Reject actions themselves — a
  // viewer who can't act on a request has nothing to be notified about.
  if (!can(actor, "users:edit")) return [];

  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.status, "pending"))
    .orderBy(desc(user.createdAt));

  return rows.map((row) => ({
    key: `users:${row.id}`,
    module: "users",
    entityId: row.id,
    title: "New access request",
    description: `${row.name} (${row.email}) is waiting for approval.`,
    href: "/admin/users?status=pending",
    createdAt: row.createdAt,
  }));
}

const NOTIFICATION_SOURCES: readonly NotificationSource[] = [pendingUserSource];

/** The header bell's feed: every open item across every source, marked read/unread for the current viewer. */
export async function listNotifications(): Promise<NotificationItem[]> {
  const actor = await getCurrentUser();
  if (!actor) return [];

  const items = (await Promise.all(NOTIFICATION_SOURCES.map((source) => source(actor)))).flat();
  if (items.length === 0) return [];

  const reads = await db
    .select({ module: notificationRead.module, entityId: notificationRead.entityId })
    .from(notificationRead)
    .where(eq(notificationRead.userId, actor.id));
  const readKeys = new Set(reads.map((row) => `${row.module}:${row.entityId}`));

  return items
    .map((item) => ({ ...item, read: readKeys.has(item.key) }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * The raw pending-approval queue depth, for the "User Management" sidebar
 * badge. Deliberately unaffected by read state — it only changes once a
 * request is actually approved or rejected, unlike the bell's unread count.
 */
export async function countPendingUserApprovals(): Promise<number> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor, "users:edit")) return 0;

  const [{ value }] = await db.select({ value: count() }).from(user).where(eq(user.status, "pending"));
  return value;
}
