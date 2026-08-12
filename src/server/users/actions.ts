"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { role, session, user, userStatus } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import { assignableRoles, denyReasonForActingOn } from "@/lib/rbac";
import { authorize, AuthorizationError, type CurrentUser } from "@/lib/session";
import { listRoleOptions } from "@/server/roles/queries";
import { listUsers } from "@/server/users/queries";

import type { ActionResult, UserFilters, UserListResult } from "./types";

const idSchema = z.string().min(1, "A user must be selected");
const roleIdSchema = z.string().min(1, "A role must be selected");

/**
 * Wraps an action body so every failure becomes a rendered message rather than
 * an unhandled server exception. Unexpected errors are logged in full but
 * reported generically — internal detail must not leak to the browser.
 */
async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[users] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Loads the target and confirms the actor outranks them.
 *
 * Every mutation runs through here, so the rank rules in `lib/rbac.ts` are
 * enforced in exactly one place — a manager cannot suspend an admin no matter
 * which action they reach for.
 */
async function loadTarget(actor: CurrentUser, targetId: string) {
  const [target] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      roleLabel: role.label,
      rank: role.rank,
      status: user.status,
    })
    .from(user)
    .innerJoin(role, eq(role.id, user.roleId))
    .where(eq(user.id, targetId))
    .limit(1);

  if (!target) throw new AuthorizationError("That user no longer exists.");

  const denial = denyReasonForActingOn(actor, target);
  if (denial) throw new AuthorizationError(denial);

  return target;
}

/**
 * Revokes every live session for a user.
 *
 * Called whenever access is narrowed or removed. Without this, the 5-minute
 * session cookie cache would let a suspended or demoted user keep their old
 * privileges until it expired.
 */
async function revokeSessions(userId: string) {
  await db.delete(session).where(eq(session.userId, userId));
}

function refreshUserViews() {
  revalidatePath("/admin/users");
}

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

/** Server-action entry point for the table's TanStack Query `queryFn`. */
export async function fetchUsers(filters: UserFilters): Promise<UserListResult> {
  return listUsers(filters);
}

/* -------------------------------------------------------------------------- */
/*  Approval                                                                  */
/* -------------------------------------------------------------------------- */

export async function approveUser(input: { userId: string; role: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("users:edit");
    const userId = idSchema.parse(input.userId);
    const roleId = roleIdSchema.parse(input.role);

    const target = await loadTarget(actor, userId);

    if (target.status !== "pending") {
      return { ok: false, error: `${target.name} has already been reviewed.` };
    }

    // Approving *is* granting a role, so the assignable-roles rule applies here
    // just as it does to an explicit role change.
    const chosenRole = assignableRoles(actor, await listRoleOptions()).find((r) => r.id === roleId);
    if (!chosenRole) {
      return { ok: false, error: "You cannot grant that role." };
    }

    await db
      .update(user)
      .set({ status: "active", roleId, approvedAt: new Date(), approvedBy: actor.id })
      .where(eq(user.id, userId));

    await recordAudit({
      module: "users",
      action: "approved",
      entityId: userId,
      entityLabel: target.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { status: target.status, role: null },
        { status: "active", role: chosenRole.label },
        { status: "Status", role: "Role" },
      ),
    });

    refreshUserViews();
    return {
      ok: true,
      data: undefined,
      message: `${target.name} approved as ${chosenRole.label}.`,
    };
  });
}

export async function rejectUser(input: { userId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("users:edit");
    const userId = idSchema.parse(input.userId);
    const target = await loadTarget(actor, userId);

    if (target.status !== "pending") {
      return { ok: false, error: `${target.name} has already been reviewed.` };
    }

    // A rejected request is deleted rather than kept as a tombstone, so the
    // person can register again if it was turned down by mistake.
    await recordAudit({
      module: "users",
      action: "rejected",
      entityId: userId,
      entityLabel: target.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { email: target.email, status: target.status },
        null,
        { email: "Email", status: "Status" },
      ),
    });

    await db.delete(user).where(eq(user.id, userId));

    refreshUserViews();
    return { ok: true, data: undefined, message: `Access request from ${target.name} rejected.` };
  });
}

/* -------------------------------------------------------------------------- */
/*  Status                                                                    */
/* -------------------------------------------------------------------------- */

export async function setUserStatus(input: {
  userId: string;
  status: "active" | "suspended";
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("users:edit");
    const userId = idSchema.parse(input.userId);
    const status = z.enum(userStatus.enumValues).parse(input.status);

    if (status === "pending") {
      return { ok: false, error: "A user cannot be moved back to pending." };
    }

    const target = await loadTarget(actor, userId);

    if (target.status === status) {
      return { ok: false, error: `${target.name} is already ${status}.` };
    }

    await db.update(user).set({ status }).where(eq(user.id, userId));

    if (status === "suspended") await revokeSessions(userId);

    await recordAudit({
      module: "users",
      action: status === "suspended" ? "suspended" : "reinstated",
      entityId: userId,
      entityLabel: target.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ status: target.status }, { status }, { status: "Status" }),
    });

    refreshUserViews();
    return {
      ok: true,
      data: undefined,
      message:
        status === "suspended"
          ? `${target.name} suspended and signed out.`
          : `${target.name} reinstated.`,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Role                                                                      */
/* -------------------------------------------------------------------------- */

export async function changeUserRole(input: { userId: string; role: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("users:edit");
    const userId = idSchema.parse(input.userId);
    const roleId = roleIdSchema.parse(input.role);

    const target = await loadTarget(actor, userId);

    if (target.roleId === roleId) {
      return { ok: false, error: `${target.name} already has the ${target.roleLabel} role.` };
    }

    const chosenRole = assignableRoles(actor, await listRoleOptions()).find((r) => r.id === roleId);
    if (!chosenRole) {
      return { ok: false, error: "You cannot grant that role." };
    }

    await db.update(user).set({ roleId }).where(eq(user.id, userId));

    // A demotion must take effect immediately; re-authenticating picks up the
    // narrower role. Promotions are revoked too — one rule is easier to trust.
    await revokeSessions(userId);

    await recordAudit({
      module: "users",
      action: "role_changed",
      entityId: userId,
      entityLabel: target.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ role: target.roleLabel }, { role: chosenRole.label }, { role: "Role" }),
    });

    refreshUserViews();
    return {
      ok: true,
      data: undefined,
      message: `${target.name} is now ${chosenRole.label}. They'll need to sign in again.`,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Deletion                                                                  */
/* -------------------------------------------------------------------------- */

export async function deleteUser(input: { userId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("users:delete");
    const userId = idSchema.parse(input.userId);
    const target = await loadTarget(actor, userId);

    // Write the audit entry first: the row's FK is `on delete set null`, so
    // ordering it this way keeps the actor attribution intact.
    await recordAudit({
      module: "users",
      action: "deleted",
      entityId: userId,
      entityLabel: target.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { email: target.email, role: target.roleLabel, status: target.status },
        null,
        { email: "Email", role: "Role", status: "Status" },
      ),
    });

    await db.delete(user).where(eq(user.id, userId));

    refreshUserViews();
    return { ok: true, data: undefined, message: `${target.name} removed from MCSU.` };
  });
}
