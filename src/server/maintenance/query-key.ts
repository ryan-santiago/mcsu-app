import type { LookupKind } from "./types";

/** Shared between the server page (prefetch) and the client view (read/invalidate). */
export const lookupQueryKey = (kind: LookupKind) => ["maintenance", kind] as const;
