"use client";

import { Briefcase, Building2, Contact, Handshake, TrendingUp, UserCog, UsersRound, VenetianMask } from "lucide-react";

import { LookupTable } from "@/components/maintenance/lookup-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LOOKUP_META, type LookupKind } from "@/server/maintenance/types";

const TAB_ICONS = {
  client: Building2,
  position: Briefcase,
  level: TrendingUp,
  gender: VenetianMask,
  team: UsersRound,
  sales_representative: Contact,
  solutions_manager: UserCog,
  engagement_type: Handshake,
} as const;

const KINDS: LookupKind[] = [
  "client",
  "position",
  "level",
  "gender",
  "team",
  "sales_representative",
  "solutions_manager",
  "engagement_type",
];

type MaintenanceViewProps = {
  canManage: boolean;
};

export function MaintenanceView({ canManage }: MaintenanceViewProps) {
  return (
    <Tabs defaultValue="client" className="gap-6">
      <div className="scrollbar-none overflow-x-auto border-b">
        <TabsList variant="line">
          {KINDS.map((kind) => {
            const Icon = TAB_ICONS[kind];
            return (
              <TabsTrigger key={kind} value={kind} className="gap-1.5">
                <Icon aria-hidden />
                {LOOKUP_META[kind].label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {KINDS.map((kind) => (
        <TabsContent key={kind} value={kind}>
          <LookupTable
            kind={kind}
            label={LOOKUP_META[kind].label}
            singular={LOOKUP_META[kind].singular}
            icon={TAB_ICONS[kind]}
            canManage={canManage}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
