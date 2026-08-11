import "server-only";

import { db } from "@/db";
import { auditLog, type AuditChange } from "@/db/schema";
import type { AuditModule } from "@/lib/audit-registry";

export type RecordAuditInput = {
  module: AuditModule;
  /** Short past-tense verb: "created", "updated", "approved", "suspended", "role_changed", "deleted", "login"… */
  action: string;
  /** The id of the affected record in its own module's table. */
  entityId?: string | null;
  /** Human label snapshotted at write time (e.g. the record's name). */
  entityLabel?: string | null;
  /** Field-level before/after. Omit for pure events with no state (login, logout). */
  changes?: AuditChange[] | null;
  actorId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
};

/**
 * Appends to the audit trail.
 *
 * Deliberately never throws: an audit write failing should not roll back the
 * action the user actually asked for, or break a login. Failures are logged so
 * they still surface in Vercel's runtime logs.
 */
export async function recordAudit(entry: RecordAuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      module: entry.module,
      action: entry.action,
      entityId: entry.entityId ?? null,
      entityLabel: entry.entityLabel ?? null,
      changes: entry.changes ?? null,
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to record entry", { module: entry.module, action: entry.action, error });
  }
}

/**
 * Computes a field-level diff between two plain snapshots.
 *
 * This is the piece that makes the Audit Trail apply to every future module
 * automatically: an edit handler calls `diffFields(before, after, labels)` and
 * passes the result straight to `recordAudit()`. Fields missing from `labels`
 * fall back to their key as the display label.
 *
 * `before: null` treats every field in `after` as newly set (a create).
 * `after: null` treats every field in `before` as cleared (a delete) —
 * `newValue` is `null` for each, so the Audit Trail reads as "X → (removed)".
 *
 * Values are compared with a JSON-stringify equality check rather than
 * `===` so nested values (arrays, plain objects) diff correctly, not just
 * primitives.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: Partial<T> | null,
  after: Partial<T> | null,
  labels: Partial<Record<keyof T, string>> = {},
): AuditChange[] {
  const keys = new Set<keyof T>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ] as (keyof T)[]);

  const changes: AuditChange[] = [];

  for (const key of keys) {
    const oldValue = before?.[key] ?? null;
    const newValue = after?.[key] ?? null;

    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;

    changes.push({
      field: String(key),
      label: labels[key] ?? String(key),
      oldValue,
      newValue,
    });
  }

  return changes;
}
