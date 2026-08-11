import type { AuditFilters } from "./types";

/**
 * Shared between the server page (which prefetches with it) and the client
 * view (which reads/invalidates with it) — see `src/server/users/query-key.ts`
 * for why this can't live in the client component itself.
 */
export const auditQueryKey = (filters: AuditFilters) => ["audit", filters] as const;
