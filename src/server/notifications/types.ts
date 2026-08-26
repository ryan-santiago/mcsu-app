/**
 * One item in the header notification bell.
 *
 * Computed on read from a source module's live data — never stored — so a
 * resolved item (e.g. a pending user that gets approved) simply stops being
 * produced rather than needing to be deleted from anywhere.
 */
export type NotificationItem = {
  /** `${module}:${entityId}` — stable across requests, used as the read marker's key and the list's React key. */
  key: string;
  module: string;
  entityId: string;
  title: string;
  description: string;
  /** Where clicking the item should navigate. */
  href: string;
  createdAt: Date;
  read: boolean;
};
