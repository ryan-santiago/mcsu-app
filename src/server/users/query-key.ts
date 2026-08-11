import type { UserFilters } from "./types";

/**
 * Shared between the server page (which prefetches with it) and the client
 * view (which reads/invalidates with it). Kept in a plain module with no
 * `"use client"` directive — a server component cannot call a function
 * defined in a client module, even a pure one.
 */
export const usersQueryKey = (filters: UserFilters) => ["users", filters] as const;
