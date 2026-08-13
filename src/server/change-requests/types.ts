import type { AuditChange, ChangeRequestStatus } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";

export type { ActionResult, ChangeRequestStatus };

/** A pending/reviewed self-service employee edit, as rendered by the Approvals queue. */
export type ChangeRequestRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  requesterId: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  /** Null once the requester's account no longer exists — nobody can approve/reject it then. */
  requesterRank: number | null;
  requesterRoleLabel: string | null;
  status: ChangeRequestStatus;
  changes: AuditChange[];
  createdAt: Date;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
};

export type ChangeRequestFilters = {
  status?: ChangeRequestStatus | "all";
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type ChangeRequestCounts = Record<ChangeRequestStatus, number>;

export type ChangeRequestListResult = {
  requests: ChangeRequestRow[];
  counts: ChangeRequestCounts;
  total: number;
  page: number;
  pageSize: number;
};
