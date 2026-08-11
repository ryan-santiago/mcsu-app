import "server-only";

import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, user } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { AuditEntry, AuditFilters, AuditListResult } from "./types";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function buildWhere(filters: AuditFilters): SQL | undefined {
  const clauses: SQL[] = [];

  if (filters.from) clauses.push(gte(auditLog.createdAt, filters.from));
  if (filters.to) clauses.push(lte(auditLog.createdAt, filters.to));

  if (filters.module && filters.module !== "all") {
    clauses.push(eq(auditLog.module, filters.module));
  }

  if (filters.action && filters.action !== "all") {
    clauses.push(eq(auditLog.action, filters.action));
  }

  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    const match = or(
      ilike(auditLog.actorEmail, pattern),
      ilike(user.name, pattern),
      ilike(auditLog.entityLabel, pattern),
    );
    if (match) clauses.push(match);
  }

  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

/**
 * Lists audit entries for the Audit Trail page: date-range, module, action and
 * actor/entity search, paginated newest-first.
 *
 * Unlike `listUsers()`, this has no natural upper bound — every edit and
 * delete across every module writes a row here forever — so it's genuinely
 * paginated (`page`/`pageSize`) rather than capped at a fixed limit.
 */
export async function listAuditEntries(filters: AuditFilters = {}): Promise<AuditListResult> {
  await authorize("audit:read");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const where = buildWhere(filters);

  const rows = await db
    .select({
      id: auditLog.id,
      module: auditLog.module,
      action: auditLog.action,
      entityId: auditLog.entityId,
      entityLabel: auditLog.entityLabel,
      changes: auditLog.changes,
      actorId: auditLog.actorId,
      actorEmail: auditLog.actorEmail,
      actorName: user.name,
      ipAddress: auditLog.ipAddress,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorId, user.id))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorId, user.id))
    .where(where);

  return { entries: rows as AuditEntry[], total, page, pageSize };
}
