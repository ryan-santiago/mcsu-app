"use client";

import {
  ChevronRight,
  ClipboardList,
  FolderKanban,
  History,
  IdCard,
  Kanban,
  Laptop,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Settings,
  ShieldCheck,
  UserCheck,
  UserRoundCog,
  UserSearch,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { EngagementNavGroup } from "@/components/layout/engagement-nav-group";
import { PinToggleButton } from "@/components/layout/pin-toggle-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePinnedNavSections } from "@/hooks/use-pinned-nav-sections";
import { cn } from "@/lib/utils";
import { isNavItemActive, type NavGroup, type NavIconKey, type NavItem } from "@/lib/navigation";
import type { EngagementNavData, EngagementNavGroupData } from "@/server/engagement/nav";

/** Resolves the serializable icon key from `lib/navigation.ts` to a component. */
const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  announcements: Megaphone,
  users: Users,
  audit: History,
  employees: IdCard,
  projects: FolderKanban,
  "employee-recommendations": UserCheck,
  "talent-acquisition": UserSearch,
  "activity-report": ClipboardList,
  maintenance: Wrench,
  devices: Laptop,
  "access-control": ShieldCheck,
  approvals: ListChecks,
  settings: Settings,
  "staff-augmentation": UserRoundCog,
  "one-lot-projects": Kanban,
};

type SidebarNavProps = {
  groups: NavGroup[];
  /** Item lists for `dynamicKind` nav items — fetched server-side, see `getEngagementNavData()`. */
  dynamicNav: EngagementNavData;
  /** Pending-count badges for nav items, keyed by href — see `app/(app)/layout.tsx`. */
  navBadges: Record<string, number>;
  /** Called after a link is followed, so the mobile drawer can close itself. */
  onNavigate?: () => void;
};

/**
 * The nav list itself, shared by the desktop rail and the mobile drawer.
 *
 * The active item is marked with `aria-current` for assistive tech and an
 * orange bar for everyone else — the one place the brand accent appears in the
 * app chrome.
 */
export function SidebarNav({ groups, dynamicNav, navBadges, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const { isPinned, togglePin } = usePinnedNavSections();

  return (
    <nav aria-label="Main" className="flex flex-col gap-6 px-3">
      {groups.map((group, index) => (
        <div key={group.title ?? `group-${index}`} className="space-y-1">
          {group.title ? (
            <h2 className="text-muted-foreground/70 px-3 pt-1 pb-2 text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
              {group.title}
            </h2>
          ) : null}

          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isNavItemActive(item, pathname);
              const Icon = NAV_ICONS[item.icon];
              const dynamicGroup = item.dynamicKind ? dynamicNav[item.dynamicKind] : undefined;
              const badgeCount = navBadges[item.href];

              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "bg-brand-accent absolute inset-y-1.5 left-0 w-[3px] rounded-full transition-opacity",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.title}</span>
                  {badgeCount !== undefined && badgeCount > 0 ? (
                    <span className="bg-warning/15 text-warning ml-auto rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none font-semibold tabular-nums">
                      {badgeCount}
                    </span>
                  ) : null}
                </Link>
              );

              return (
                <li key={item.href}>
                  {dynamicGroup ? (
                    <DynamicNavRow
                      item={item}
                      link={link}
                      dynamicGroup={dynamicGroup}
                      pathname={pathname}
                      onNavigate={onNavigate}
                      pinned={isPinned(item.href)}
                      onTogglePin={() => togglePin(item.href)}
                    />
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

type DynamicNavRowProps = {
  item: NavItem;
  link: React.ReactNode;
  dynamicGroup: EngagementNavGroupData;
  pathname: string;
  onNavigate?: () => void;
  pinned: boolean;
  onTogglePin: () => void;
};

/**
 * Own component (not inlined in the `.map()` above) so each row's "has the
 * user manually toggled this open/closed this session" state gets its own
 * `useState` — Rules of Hooks forbids calling hooks per-iteration inline.
 * Closed by default; pinning (persisted, see `usePinnedNavSections`) opens
 * it immediately and makes it open-by-default on future visits, but the
 * chevron stays freely togglable afterward regardless of pin state.
 */
function DynamicNavRow({ item, link, dynamicGroup, pathname, onNavigate, pinned, onTogglePin }: DynamicNavRowProps) {
  const [manualOverride, setManualOverride] = React.useState<boolean | null>(null);
  const open = manualOverride ?? pinned;

  return (
    <Collapsible open={open} onOpenChange={setManualOverride}>
      <div className="group/navrow flex items-center gap-0.5">
        <CollapsibleTrigger
          aria-label={`Toggle ${item.title}`}
          className="text-muted-foreground hover:text-sidebar-accent-foreground shrink-0 rounded-md p-1.5 transition-colors [&[data-state=open]>svg]:rotate-90"
        >
          <ChevronRight className="size-3.5 transition-transform" aria-hidden />
        </CollapsibleTrigger>
        {link}
        <PinToggleButton pinned={pinned} onToggle={onTogglePin} label={item.title} />
      </div>

      <CollapsibleContent>
        <EngagementNavGroup data={dynamicGroup} pathname={pathname} onNavigate={onNavigate} />
      </CollapsibleContent>
    </Collapsible>
  );
}
