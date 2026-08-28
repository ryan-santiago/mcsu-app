"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavGroup } from "@/lib/navigation";
import type { CurrentUser } from "@/lib/session";
import type { EngagementNavData } from "@/server/engagement/nav";

type AppSidebarProps = {
  groups: NavGroup[];
  user: CurrentUser;
  dynamicNav: EngagementNavData;
  /** Pending-count badges for nav items, keyed by href — see `app/(app)/layout.tsx`. */
  navBadges: Record<string, number>;
};

function SidebarBody({ groups, user, dynamicNav, navBadges, onNavigate }: AppSidebarProps & { onNavigate?: () => void }) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        <SidebarNav groups={groups} dynamicNav={dynamicNav} navBadges={navBadges} onNavigate={onNavigate} />
      </div>

      <div className="border-sidebar-border border-t p-2">
        <UserMenu user={user} />
      </div>
    </>
  );
}

/** Fixed rail on desktop; a slide-over drawer on small screens. */
export function AppSidebar({ groups, user, dynamicNav, navBadges }: AppSidebarProps) {
  return (
    <aside className="bg-sidebar border-sidebar-border hidden w-64 shrink-0 flex-col border-r lg:flex">
      <div className="border-sidebar-border flex h-16 items-center border-b px-5">
        <Link href="/announcements" aria-label="MCSU Console — Announcements">
          <Logo height={26} priority />
        </Link>
      </div>

      <SidebarBody groups={groups} user={user} dynamicNav={dynamicNav} navBadges={navBadges} />
    </aside>
  );
}

export function MobileSidebar({ groups, user, dynamicNav, navBadges }: AppSidebarProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="bg-sidebar flex w-72 flex-col gap-0 p-0">
        <SheetHeader className="border-sidebar-border h-16 justify-center border-b px-5">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Logo height={26} />
        </SheetHeader>

        <SidebarBody
          groups={groups}
          user={user}
          dynamicNav={dynamicNav}
          navBadges={navBadges}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
