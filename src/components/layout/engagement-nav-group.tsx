"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

  const isActiveGroup = item.children.some((child) => pathname === child.href);

  return (
    <li>
      <Collapsible defaultOpen={isActiveGroup}>
        <CollapsibleTrigger className="text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors [&[data-state=open]>svg]:rotate-90">
          <ChevronRight className="size-3.5 shrink-0 transition-transform" aria-hidden />
          <span className="truncate">{item.label}</span>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-0.5 ml-3 space-y-0.5 border-l pl-2">
          {item.children.map((child) => {
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
