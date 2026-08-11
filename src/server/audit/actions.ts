"use server";

import { listAuditEntries } from "./queries";
import type { AuditFilters, AuditListResult } from "./types";

/** Server-action entry point for the table's TanStack Query `queryFn`. */
export async function fetchAuditLog(filters: AuditFilters): Promise<AuditListResult> {
  return listAuditEntries(filters);
}
