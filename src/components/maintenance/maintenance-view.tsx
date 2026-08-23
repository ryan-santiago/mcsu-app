"use client";

import {
  Briefcase,
  Building2,
  Contact,
  FileSignature,
  Handshake,
  MoreHorizontal,
  TrendingUp,
  UserCog,
  UsersRound,
  VenetianMask,
} from "lucide-react";
import * as React from "react";

import { LookupTable } from "@/components/maintenance/lookup-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  employment_type: FileSignature,
} as const;

const KINDS: LookupKind[] = [
  "client",
  "team",
  "level",
  "position",
  "employment_type",
  "engagement_type",
  "gender",
  "sales_representative",
  "solutions_manager",
];

function tabLabelFor(kind: LookupKind): string {
  return LOOKUP_META[kind].tabLabel ?? LOOKUP_META[kind].label;
}

type MaintenanceViewProps = {
  canManage: boolean;
};

export function MaintenanceView({ canManage }: MaintenanceViewProps) {
  const [active, setActive] = React.useState<LookupKind>("client");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const triggerRefs = React.useRef<Map<LookupKind, HTMLButtonElement>>(new Map());
  // Which tabs are fully within the scroll container's visible width right
  // now — the jump menu only lists the rest, so it never duplicates a tab
  // the user can already see and click directly.
  const [visibleKinds, setVisibleKinds] = React.useState<Set<LookupKind>>(new Set(KINDS));

  React.useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleKinds((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const kind = entry.target.getAttribute("data-kind") as LookupKind;
            if (entry.intersectionRatio >= 0.99) next.add(kind);
            else next.delete(kind);
          }
          return next;
        });
      },
      { root, threshold: [0, 0.99, 1] },
    );

    triggerRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const hiddenKinds = KINDS.filter((kind) => !visibleKinds.has(kind));

  function jumpTo(kind: LookupKind) {
    setActive(kind);
    triggerRefs.current.get(kind)?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }

  return (
    <Tabs value={active} onValueChange={(value) => setActive(value as LookupKind)} className="gap-6">
      <div className="flex items-center gap-1 border-b">
        {/* The tab row itself still scrolls for anyone who prefers clicking a
            visible tab — the menu alongside it lists only what's currently
            scrolled out of view, so nothing is ever offered twice. */}
        <div ref={scrollRef} className="scrollbar-none min-w-0 flex-1 overflow-x-auto">
          <TabsList variant="line">
            {KINDS.map((kind) => {
              const Icon = TAB_ICONS[kind];
              return (
                <TabsTrigger
                  key={kind}
                  value={kind}
                  data-kind={kind}
                  ref={(element) => {
                    if (element) triggerRefs.current.set(kind, element);
                    else triggerRefs.current.delete(kind);
                  }}
                  className="gap-1.5"
                >
                  <Icon aria-hidden />
                  {tabLabelFor(kind)}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {hiddenKinds.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Jump to a Maintenance list">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hiddenKinds.map((kind) => {
                const Icon = TAB_ICONS[kind];
                return (
                  <DropdownMenuItem key={kind} onSelect={() => jumpTo(kind)}>
                    <Icon className="size-4" aria-hidden />
                    {tabLabelFor(kind)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
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
