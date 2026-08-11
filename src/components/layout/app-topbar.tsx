"use client";

import { usePathname } from "next/navigation";

import { MobileSidebar } from "@/components/layout/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { findNavItem } from "@/lib/navigation";
import type { NavGroup } from "@/lib/navigation";
import { ROLES } from "@/lib/rbac";
import type { CurrentUser } from "@/lib/session";

type AppTopbarProps = {
  groups: NavGroup[];
  user: CurrentUser;
};

export function AppTopbar({ groups, user }: AppTopbarProps) {
  const pathname = usePathname();
  const current = findNavItem(pathname);

  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-sm sm:px-6">
      <MobileSidebar groups={groups} user={user} />

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight">
          {current?.title ?? "MCSU Console"}
        </h1>
      </div>

      <Badge variant="secondary" className="hidden shrink-0 font-normal sm:inline-flex">
        {ROLES[user.role].label}
      </Badge>
    </header>
  );
}
