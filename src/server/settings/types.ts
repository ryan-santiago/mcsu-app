import type { AuditChange } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";

export type { ActionResult };

/** A signed-in user's own pending self-service edit, shown as a banner on Settings & Profile. */
export type MyPendingChangeRequest = {
  id: string;
  changes: AuditChange[];
  createdAt: Date;
};
