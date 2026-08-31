import type { TaRequestStatus } from "@/db/schema";

export type TaRequestRow = {
  id: string;
  jobProfileId: string;
  positionName: string;
  levelName: string;
  jobDescription: string | null;
  jobQualification: string | null;
  clientId: string;
  clientName: string;
  employmentTypeId: string | null;
  employmentTypeName: string | null;
  teamId: string | null;
  teamName: string | null;
  headcountNeeded: number;
  /** Count of this request's applications whose status is `hired`. */
  headcountFilled: number;
  workArrangement: string | null;
  status: TaRequestStatus;
  notes: string | null;
  requestedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const TA_REQUEST_STATUS_LABELS: Record<TaRequestStatus, string> = {
  pending_approval: "Pending Approval",
  open: "Open",
  partially_filled: "Partially Filled",
  filled: "Filled",
  cancelled: "Cancelled",
};
