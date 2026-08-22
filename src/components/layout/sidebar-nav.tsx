"use client";

import {
  ClipboardList,
  FolderKanban,
  History,
  IdCard,
  Kanban,
  Laptop,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  UserRoundCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { EngagementNavGroup } from "@/components/layout/engagement-nav-group";
import { cn } from "@/lib/utils";
import { isNavItemActive, type NavGroup, type NavIconKey } from "@/lib/navigation";
import type { EngagementNavData } from "@/server/engagement/nav";

/** Resolves the serializable icon key from `lib/navigation.ts` to a component. */
const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  users: Users,
  audit: History,
  employees: IdCard,
  projects: FolderKanban,
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
export function SidebarNav({ groups, dynamicNav, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

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

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
                  </Link>

                  {dynamicGroup ? (
                    <EngagementNavGroup data={dynamicGroup} pathname={pathname} onNavigate={onNavigate} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
