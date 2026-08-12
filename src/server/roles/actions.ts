"use server";

import { revalidatePath } from "next/cache";
import { count, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { role, session, user } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import { PERMISSIONS, type Permission } from "@/lib/rbac";
import { authorize, AuthorizationError } from "@/lib/session";

import { listRoles } from "./queries";
import type { ActionResult, Role } from "./types";

const idSchema = z.string().min(1, "A role must be selected");
const labelSchema = z.string().trim().min(1, "Name is required").max(60, "That name is too long");
const descriptionSchema = z
  .string()
  .trim()
  .max(200, "That description is too long")
  .optional()
  .or(z.literal(""));
const rankSchema = z.coerce
  .number()
  .int("Rank must be a whole number")
  .min(1, "Rank must be at least 1")
  .max(999, "That rank is too high");
const permissionsSchema = z.array(z.enum(PERMISSIONS));

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[roles] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshRoleViews() {
  revalidatePath("/admin/access-control");
}

/** Server-action entry point for Access Control's TanStack Query `queryFn` — `queries.ts` is server-only. */
export async function fetchRoles(): Promise<Role[]> {
  return listRoles();
}

/**
 * Revokes every live session for every user holding a role.
 *
 * Called whenever a role's permissions change — the 5-minute session cookie
 * cache would otherwise let everyone holding that role keep acting on the old
 * permission set until it expired. Same rule as the per-user
 * `revokeSessions()` in `src/server/users/actions.ts`, fanned out to a role's
 * whole membership at once.
 */
async function revokeSessionsForRole(roleId: string) {
  const holders = db.select({ id: user.id }).from(user).where(eq(user.roleId, roleId));
  await db.delete(session).where(inArray(session.userId, holders));
}

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "role";
}

/** Appends a numeric suffix until the slug is free — role ids are permanent once created. */
async function uniqueSlug(label: string): Promise<string> {
  const base = slugify(label);
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const [existing] = await db.select({ id: role.id }).from(role).where(eq(role.id, candidate)).limit(1);
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function createRole(input: {
  label: string;
  description?: string;
  rank: number;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("access_control:write");
    const label = labelSchema.parse(input.label);
    const description = descriptionSchema.parse(input.description) || null;
    const rank = rankSchema.parse(input.rank);

    const id = await uniqueSlug(label);

    await db.insert(role).values({ id, label, description, rank, isSystem: false, permissions: [] });

    await recordAudit({
      module: "roles",
      action: "created",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { label, description, rank }, { label: "Name", description: "Description", rank: "Rank" }),
    });

    refreshRoleViews();
    return { ok: true, data: { id }, message: `Role "${label}" created.` };
  });
}

export async function updateRoleMeta(input: {
  id: string;
  label: string;
  description?: string;
  rank: number;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("access_control:edit");
    const id = idSchema.parse(input.id);
    const label = labelSchema.parse(input.label);
    const description = descriptionSchema.parse(input.description) || null;
    const rank = rankSchema.parse(input.rank);

    const [target] = await db.select().from(role).where(eq(role.id, id)).limit(1);
    if (!target) return { ok: false, error: "That role no longer exists." };

    await db.update(role).set({ label, description, rank }).where(eq(role.id, id));

    await recordAudit({
      module: "roles",
      action: "updated",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { label: target.label, description: target.description, rank: target.rank },
        { label, description, rank },
        { label: "Name", description: "Description", rank: "Rank" },
      ),
    });

    refreshRoleViews();
    return { ok: true, data: undefined, message: `Role "${label}" updated.` };
  });
}

export async function updateRolePermissions(input: { id: string; permissions: Permission[] }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("access_control:edit");
    const id = idSchema.parse(input.id);
    const permissions = permissionsSchema.parse(input.permissions);

    // The Administrator role always has full access — locked here, not just
    // hidden in the UI, so the workspace can never accidentally lock itself
    // out of its own admin tools.
    if (id === "admin") {
      return { ok: false, error: "The Administrator role's permissions cannot be changed." };
    }

    const [target] = await db.select().from(role).where(eq(role.id, id)).limit(1);
    if (!target) return { ok: false, error: "That role no longer exists." };

    await db.update(role).set({ permissions }).where(eq(role.id, id));
    await revokeSessionsForRole(id);

    await recordAudit({
      module: "roles",
      action: "permissions_changed",
      entityId: id,
      entityLabel: target.label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ permissions: target.permissions }, { permissions }, { permissions: "Permissions" }),
    });

    refreshRoleViews();
    return {
      ok: true,
      data: undefined,
      message: `Permissions updated for "${target.label}". Everyone holding it was signed out.`,
    };
  });
}

export async function deleteRole(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("access_control:delete");
    const id = idSchema.parse(input.id);

    const [target] = await db.select().from(role).where(eq(role.id, id)).limit(1);
    if (!target) return { ok: false, error: "That role no longer exists." };

    if (target.isSystem) {
      return { ok: false, error: `"${target.label}" is a required role and cannot be deleted.` };
    }

    const [{ total }] = await db.select({ total: count() }).from(user).where(eq(user.roleId, id));
    if (total > 0) {
      return {
        ok: false,
        error: `Cannot delete — ${total} user${total === 1 ? "" : "s"} still ${total === 1 ? "holds" : "hold"} the "${target.label}" role. Reassign them first.`,
      };
    }

    await recordAudit({
      module: "roles",
      action: "deleted",
      entityId: id,
      entityLabel: target.label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ label: target.label }, null, { label: "Name" }),
    });

    await db.delete(role).where(eq(role.id, id));

    refreshRoleViews();
    return { ok: true, data: undefined, message: `Role "${target.label}" deleted.` };
  });
}
