import type { ProjectFilters } from "./types";

/** Shared between the server page (prefetch) and the client view (read/invalidate). */
export const projectsQueryKey = (filters: ProjectFilters) => ["projects", "list", filters] as const;
export const projectQueryKey = (id: string) => ["projects", "detail", id] as const;
