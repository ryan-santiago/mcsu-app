"use client";

import {
  Briefcase,
  BriefcaseBusiness,
  Building2,
  Contact,
  FileSignature,
  Handshake,
  MoreHorizontal,
  TrendingUp,
  UserCog,
  UsersRound,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

import { JobProfilesTable } from "@/components/maintenance/job-profiles-table";
import { LookupTable } from "@/components/maintenance/lookup-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LOOKUP_META, type LookupKind } from "@/server/maintenance/types";

/** `"job_profile"` isn't a `LookupKind` — it's a composite (Position × Level) entity with its own table, not a flat name-only lookup — so the tab set is a superset of `LookupKind`. */
type MaintenanceTab = LookupKind | "job_profile";

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
  job_profile: BriefcaseBusiness,
} satisfies Record<MaintenanceTab, LucideIcon>;

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

const TABS: MaintenanceTab[] = [...KINDS, "job_profile"];

function tabLabelFor(tab: MaintenanceTab): string {
  if (tab === "job_profile") return "Job Profiles";
  return LOOKUP_META[tab].tabLabel ?? LOOKUP_META[tab].label;
}

type MaintenanceViewProps = {
  canManage: boolean;
};

export function MaintenanceView({ canManage }: MaintenanceViewProps) {
  const [active, setActive] = React.useState<MaintenanceTab>("client");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const triggerRefs = React.useRef<Map<MaintenanceTab, HTMLButtonElement>>(new Map());
  // Which tabs are fully within the scroll container's visible width right
  // now — the jump menu only lists the rest, so it never duplicates a tab
  // the user can already see and click directly.
  const [visibleTabs, setVisibleTabs] = React.useState<Set<MaintenanceTab>>(new Set(TABS));

  React.useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleTabs((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const tab = entry.target.getAttribute("data-tab") as MaintenanceTab;
            if (entry.intersectionRatio >= 0.99) next.add(tab);
            else next.delete(tab);
          }
          return next;
        });
      },
      { root, threshold: [0, 0.99, 1] },
    );

    triggerRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const hiddenTabs = TABS.filter((tab) => !visibleTabs.has(tab));

  function jumpTo(tab: MaintenanceTab) {
    setActive(tab);
    triggerRefs.current.get(tab)?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }

  return (
    <Tabs value={active} onValueChange={(value) => setActive(value as MaintenanceTab)} className="gap-6">
      <div className="flex items-center gap-1 border-b">
        {/* The tab row itself still scrolls for anyone who prefers clicking a
            visible tab — the menu alongside it lists only what's currently
            scrolled out of view, so nothing is ever offered twice. */}
        <div ref={scrollRef} className="scrollbar-none min-w-0 flex-1 overflow-x-auto">
          <TabsList variant="line">
            {TABS.map((tab) => {
              const Icon = TAB_ICONS[tab];
              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  data-tab={tab}
                  ref={(element) => {
                    if (element) triggerRefs.current.set(tab, element);
                    else triggerRefs.current.delete(tab);
                  }}
                  className="gap-1.5"
                >
                  <Icon aria-hidden />
                  {tabLabelFor(tab)}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {hiddenTabs.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Jump to a Maintenance list">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hiddenTabs.map((tab) => {
                const Icon = TAB_ICONS[tab];
                return (
                  <DropdownMenuItem key={tab} onSelect={() => jumpTo(tab)}>
                    <Icon className="size-4" aria-hidden />
                    {tabLabelFor(tab)}
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

      <TabsContent value="job_profile">
        <JobProfilesTable canManage={canManage} />
      </TabsContent>
    </Tabs>
  );
}
