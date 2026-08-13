import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { employeeChangeRequest } from "@/db/schema";
import { AuthorizationError, getCurrentUser, type CurrentUser } from "@/lib/session";
import { loadEmployeeDetail } from "@/server/employees/queries";
import type { EmployeeDetail } from "@/server/employees/types";

import type { MyPendingChangeRequest } from "./types";

/**
 * Settings & Profile has no permission gate — every active signed-in user
 * reaches it (see `visibleNavigation()` in `src/lib/navigation.ts`, whose nav
 * item has no `permissions`). This is the equivalent of `authorize()` for
 * that "any active account" requirement.
 */
export async function requireActiveUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    throw new AuthorizationError("You must be signed in to do that.");
  }
  return user;
}

/**
 * The signed-in user's own Employee record, if their account email matches
 * one — `null` means the account has no linked Employee record (e.g. an
 * IT-only login), in which case Settings & Profile just shows password
 * change with no profile card.
 */
export async function getMyEmployeeDetail(): Promise<EmployeeDetail | null> {
  const actor = await requireActiveUser();
  if (!actor.employeeId) return null;
  return loadEmployeeDetail(actor.employeeId);
}

/** The signed-in user's own open self-service edit, if any — at most one at a time. */
export async function getMyPendingChangeRequest(): Promise<MyPendingChangeRequest | null> {
  const actor = await requireActiveUser();
  if (!actor.employeeId) return null;

  const [row] = await db
    .select({
      id: employeeChangeRequest.id,
      changes: employeeChangeRequest.changes,
      createdAt: employeeChangeRequest.createdAt,
    })
    .from(employeeChangeRequest)
    .where(and(eq(employeeChangeRequest.employeeId, actor.employeeId), eq(employeeChangeRequest.status, "pending")))
    .orderBy(desc(employeeChangeRequest.createdAt))
    .limit(1);

  return row ? { id: row.id, changes: row.changes ?? [], createdAt: row.createdAt } : null;
}
