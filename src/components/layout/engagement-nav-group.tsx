"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PinToggleButton } from "@/components/layout/pin-toggle-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePinnedNavSections } from "@/hooks/use-pinned-nav-sections";
import { cn } from "@/lib/utils";
import type { EngagementNavGroupData, EngagementNavItem } from "@/server/engagement/nav";

type EngagementNavGroupProps = {
  data: EngagementNavGroupData;
  pathname: string;
  /** Called after a link is followed, so the mobile drawer can close itself. */
  onNavigate?: () => void;
};

/**
 * The dynamic, DB-driven sub-tree rendered under "Staff Augmentation" and
 * "One-Lot Project" — the one place in the sidebar where items aren't static
 * `NavItem`s from `lib/navigation.ts`, so this stays a separate component
 * rather than folding into `SidebarNav`'s main loop. The expand/collapse
 * control lives on the parent menu row itself (see `SidebarNav`); this just
 * renders the content shown when that row is open.
 */
export function EngagementNavGroup({ data, pathname, onNavigate }: EngagementNavGroupProps) {
  const hasContent = data.items.length > 0 || data.canCreate;
  if (!hasContent) return null;

  return (
    <div className="mt-0.5 ml-5 space-y-0.5 border-l pl-2">
      {data.canCreate ? (
        <Link
          href={data.addHref}
          onClick={onNavigate}
          className="text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
        >
          <Plus className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{data.addLabel}</span>
        </Link>
      ) : null}

      <ul className="space-y-0.5">
        {data.items.map((item) => (
          <EngagementNavRow key={item.id} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </ul>
    </div>
  );
}

function EngagementNavRow({
  item,
  pathname,
  onNavigate,
}: {
  item: EngagementNavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  if (!item.children) {
    const active = pathname === item.href;
    return (
      <li>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "block truncate rounded-md px-2 py-1.5 text-sm transition-colors",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          )}
        >
          {item.label}
        </Link>
      </li>
    );
  }

  return <EngagementNavRowWithChildren item={item} pathname={pathname} onNavigate={onNavigate} />;
}

/**
 * Own component (not a branch inside `EngagementNavRow`) so its pin/manual-
 * toggle state hooks aren't called conditionally — `EngagementNavRow`'s
 * childless branch returns early before ever reaching them, which Rules of
 * Hooks forbids if they lived in the same component.
 */
function EngagementNavRowWithChildren({
  item,
  pathname,
  onNavigate,
}: {
  item: EngagementNavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  // The caller (`EngagementNavRow`) only reaches this component once it's
  // already confirmed `item.children` is set — TypeScript can't carry that
  // narrowing across the component boundary, so this falls back safely
  // rather than asserting it.
  const children = item.children ?? [];
  const isActiveGroup = children.some((child) => pathname === child.href);
  const { isPinned, togglePin } = usePinnedNavSections();
  const pinned = isPinned(item.href);
  const [manualOverride, setManualOverride] = React.useState<boolean | null>(null);
  // Untouched this session -> follow pin/active-page; once the user has
  // explicitly toggled the chevron, that wins outright until the row
  // remounts (e.g. navigating to a different project) — same pattern
  // `DynamicNavRow` in `sidebar-nav.tsx` uses.
  const open = manualOverride ?? (pinned || isActiveGroup);

  return (
    <li>
      <Collapsible open={open} onOpenChange={setManualOverride}>
        <div className="group/navrow flex items-center gap-0.5">
          <CollapsibleTrigger className="text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors [&[data-state=open]>svg]:rotate-90">
            <ChevronRight className="size-3.5 shrink-0 transition-transform" aria-hidden />
            <span className="truncate">{item.label}</span>
          </CollapsibleTrigger>
          <PinToggleButton pinned={pinned} onToggle={() => togglePin(item.href)} label={item.label} />
        </div>

        <CollapsibleContent className="mt-0.5 ml-3 space-y-0.5 border-l pl-2">
          {children.map((child) => {
            const active = pathname === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block truncate rounded-md px-2 py-1 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
