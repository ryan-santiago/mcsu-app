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
  | "engagement_type";

export const LOOKUP_KINDS: readonly LookupKind[] = [
  "client",
  "position",
  "level",
  "gender",
  "team",
  "sales_representative",
  "solutions_manager",
  "engagement_type",
];

export type LookupRow = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type LookupOption = { id: string; name: string };

export const LOOKUP_META: Record<LookupKind, { label: string; singular: string; auditModule: AuditModule }> = {
  client: { label: "Clients", singular: "Client", auditModule: "clients" },
  position: { label: "Positions", singular: "Position", auditModule: "positions" },
  level: { label: "Levels", singular: "Level", auditModule: "levels" },
  gender: { label: "Genders", singular: "Gender", auditModule: "genders" },
  team: { label: "Teams", singular: "Team", auditModule: "teams" },
  sales_representative: {
    label: "Sales Representatives",
    singular: "Sales Representative",
    auditModule: "sales_representatives",
  },
  solutions_manager: {
    label: "Solutions Managers",
    singular: "Solutions Manager",
    auditModule: "solutions_managers",
  },
  engagement_type: { label: "Engagement Types", singular: "Engagement Type", auditModule: "engagement_types" },
};
