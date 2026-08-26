/**
 * Shared between the client bell (which reads/invalidates with it) and
 * nothing server-side — there's no SSR prefetch here, the bell is a small
 * always-mounted client widget that fetches on its own.
 */
export const notificationsQueryKey = ["notifications"] as const;
