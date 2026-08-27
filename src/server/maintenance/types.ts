import type { AuditModule } from "@/lib/audit-registry";

/** The Maintenance-managed lookup lists that feed the Employee and Projects modules. */
export type LookupKind =
  | "client"
  | "position"
  | "level"
  | "gender"
  | "team"
  | "sales_representative"
  | "solutions_manager"
  | "engagement_type"
  | "employment_type"
  | "job_posting_source";

export const LOOKUP_KINDS: readonly LookupKind[] = [
  "client",
  "position",
  "level",
  "gender",
  "team",
  "sales_representative",
  "solutions_manager",
  "engagement_type",
  "employment_type",
  "job_posting_source",
];

export type LookupRow = {
  id: string;
  name: string;
  /** Only present for kinds where `LOOKUP_META[kind].hasEmail` is true. */
  email?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type LookupOption = { id: string; name: string };

/** One row in the Team Approvers panel — see `listTeamApprovers()`. */
export type TeamApproverRow = {
  teamId: string;
  teamName: string;
  unitManager: LookupOption | null;
  departmentHead: LookupOption | null;
};

export const LOOKUP_META: Record<
  LookupKind,
  { label: string; singular: string; auditModule: AuditModule; hasEmail: boolean; tabLabel?: string }
> = {
  client: { label: "Clients", singular: "Client", auditModule: "clients", hasEmail: false },
  position: { label: "Positions", singular: "Position", auditModule: "positions", hasEmail: false },
  level: { label: "Levels", singular: "Level", auditModule: "levels", hasEmail: false },
  gender: { label: "Genders", singular: "Gender", auditModule: "genders", hasEmail: false },
  team: { label: "Teams", singular: "Team", auditModule: "teams", hasEmail: false },
  sales_representative: {
    label: "Sales Representatives",
    singular: "Sales Representative",
    auditModule: "sales_representatives",
    /** For future email notifications (e.g. contract renewal alerts). */
    hasEmail: true,
  },
  solutions_manager: {
    label: "Solutions Managers",
    singular: "Solutions Manager",
    auditModule: "solutions_managers",
    hasEmail: true,
  },
  engagement_type: {
    label: "Engagement Types",
    singular: "Engagement Type",
    auditModule: "engagement_types",
    hasEmail: false,
    /** Short form for the tab/jump-menu only — `label`/`singular` stay full elsewhere (search placeholder, counts, empty state) so the grammar there still reads right. */
    tabLabel: "Engagement",
  },
  employment_type: {
    label: "Employment Types",
    singular: "Employment Type",
    auditModule: "employment_types",
    hasEmail: false,
    tabLabel: "Employment",
  },
  job_posting_source: {
    label: "Job Posting Sources",
    singular: "Job Posting Source",
    auditModule: "job_posting_sources",
    hasEmail: false,
    tabLabel: "Job Sources",
  },
};
