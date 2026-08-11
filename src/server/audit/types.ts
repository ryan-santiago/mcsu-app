import type { AuditChange } from "@/db/schema";

export type AuditEntry = {
  id: string;
  module: string;
  action: string;
  entityId: string | null;
  entityLabel: string | null;
  changes: AuditChange[] | null;
  actorId: string | null;
  actorEmail: string | null;
  /** The actor's current name, joined live — reflects renames, unlike entityLabel. */
  actorName: string | null;
  ipAddress: string | null;
  createdAt: Date;
};

export type AuditFilters = {
  /** Inclusive start of the date range. */
  from?: Date;
  /** Inclusive end of the date range. */
  to?: Date;
  module?: string | "all";
  action?: string | "all";
  /** Matches actor name/email or the affected entity's label. */
  search?: string;
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type AuditListResult = {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
};
