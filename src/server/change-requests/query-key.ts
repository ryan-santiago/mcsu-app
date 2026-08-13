import type { ChangeRequestFilters } from "./types";

/** Shared between the server page (prefetch) and the client view (read/invalidate). */
export const changeRequestsQueryKey = (filters: ChangeRequestFilters) => ["change-requests", "list", filters] as const;
