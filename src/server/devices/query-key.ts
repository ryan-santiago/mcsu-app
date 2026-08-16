import type { DeviceFilters } from "./types";

/** Shared between the server page (prefetch) and the client view (read/invalidate). */
export const devicesQueryKey = (filters: DeviceFilters) => ["devices", "list", filters] as const;
export const deviceQueryKey = (id: string) => ["devices", "detail", id] as const;
