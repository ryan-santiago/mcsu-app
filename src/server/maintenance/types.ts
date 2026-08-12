import type { AuditModule } from "@/lib/audit-registry";

/** The five Maintenance-managed lookup lists that feed the Employee module. */
export type LookupKind = "client" | "position" | "level" | "gender" | "team";

export const LOOKUP_KINDS: readonly LookupKind[] = ["client", "position", "level", "gender", "team"];

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
};
