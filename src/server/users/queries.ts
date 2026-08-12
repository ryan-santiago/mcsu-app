import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { user, type UserStatus } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { UserCounts, UserFilters, UserListResult, ManagedUser } from "./types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const SELECTION = {
  id: user.id,
  name: user.name,
  email: user.email,
  image: user.image,
  role: user.role,
  status: user.status,
  jobTitle: user.jobTitle,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
};

function buildWhere(filters: UserFilters): SQL | undefined {
  const clauses: SQL[] = [];

  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    const match = or(
      ilike(user.name, pattern),
      ilike(user.email, pattern),
      ilike(user.jobTitle, pattern),
    );
    if (match) clauses.push(match);
  }

  if (filters.status && filters.status !== "all") {
    clauses.push(eq(user.status, filters.status));
  }

  if (filters.role && filters.role !== "all") {
    clauses.push(eq(user.role, filters.role));
  }

  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

/**
 * Lists users for the management table, plus the per-status totals shown in the
 * filter chips.
 *
 * The counts deliberately ignore the status filter — they describe the whole
 * directory, so the chips keep showing "12 pending" while you are looking at
 * the active users.
 */
export async function listUsers(filters: UserFilters = {}): Promise<UserListResult> {
  await authorize("users:read");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const where = buildWhere(filters);

  const rows = await db
    .select(SELECTION)
    .from(user)
    // Pending first: the whole point of this screen is clearing the queue.
    .where(where)
    .orderBy(
      sql`case ${user.status} when 'pending' then 0 when 'active' then 1 else 2 end`,
      desc(user.createdAt),
      asc(user.name),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db.select({ value: count() }).from(user).where(where);

  // The status chips show whole-directory totals regardless of which status
  // tab is active, so this count deliberately excludes `status` from the
  // filter — unlike `total` above, which reflects the current page's filters.
  const countWhere = buildWhere({ search: filters.search, role: filters.role });

  const grouped = await db
    .select({ status: user.status, total: count() })
    .from(user)
    .where(countWhere)
    .groupBy(user.status);

  const counts: UserCounts = { all: 0, pending: 0, active: 0, suspended: 0 };
  for (const row of grouped) {
    counts[row.status as UserStatus] = row.total;
    counts.all += row.total;
  }

  return { users: rows as ManagedUser[], counts, total, page, pageSize };
}

/** Used by the detail dialogs; returns null rather than throwing on a bad id. */
export async function getUserById(id: string): Promise<ManagedUser | null> {
  await authorize("users:read");

  const [row] = await db.select(SELECTION).from(user).where(eq(user.id, id)).limit(1);
  return (row as ManagedUser | undefined) ?? null;
}
