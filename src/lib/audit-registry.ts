import { endOfToday, startOfToday, subDays } from "date-fns";

/**
 * The module and action registries — pure data, no `"server-only"` guard.
 *
 * `src/lib/audit.ts` (server-only: it touches the database) and the client
 * Audit Trail components (filters, badges) both need this list. Splitting it
 * out means the client bundle never tries to import a server-only module —
 * the same reason `PERMISSIONS`/`ROLES` live in the un-guarded `rbac.ts`
 * rather than a server-only file.
 *
 * Add a module here the moment it starts writing audit entries — no
 * migration required, since `audit_log.module` is plain text, not a DB enum.
 */
export const AUDIT_MODULES = [
  { value: "users", label: "User Management" },
  { value: "auth", label: "Authentication" },
] as const;

export type AuditModule = (typeof AUDIT_MODULES)[number]["value"];

/**
 * The known action vocabulary, for the filter dropdown and badge labels.
 * Not exhaustive by design — `ActionBadge` falls back to the raw string for
 * any action a future module invents that isn't listed here.
 */
export const AUDIT_ACTIONS = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
  { value: "reinstated", label: "Reinstated" },
  { value: "role_changed", label: "Role changed" },
  { value: "deleted", label: "Deleted" },
  { value: "login", label: "Signed in" },
] as const;

/**
 * The page's default filter — last 30 days.
 *
 * Shared by the server page (which prefetches with it) and the client view
 * (whose initial filter state must match exactly, or the first client render
 * refetches with a slightly different query key than what was prefetched).
 */
export function defaultAuditRange(): { from: Date; to: Date } {
  // `to` is the end of today, not the start — see the same note in
  // date-range-picker.tsx's `apply()`. Getting this wrong silently hides
  // everything logged today.
  return { from: subDays(startOfToday(), 29), to: endOfToday() };
}
