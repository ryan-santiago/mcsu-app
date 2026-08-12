"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { MobileSidebar } from "@/components/layout/app-sidebar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { breadcrumbsFor } from "@/lib/navigation";
import type { NavGroup } from "@/lib/navigation";
import type { CurrentUser } from "@/lib/session";

type AppTopbarProps = {
  groups: NavGroup[];
  user: CurrentUser;
};

export function AppTopbar({ groups, user }: AppTopbarProps) {
  const pathname = usePathname();
  const trail = breadcrumbsFor(pathname);

  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-sm sm:px-6">
      <MobileSidebar groups={groups} user={user} />

      <div className="min-w-0 flex-1">
        {trail.length === 0 ? (
          <h1 className="truncate text-base font-semibold tracking-tight">MCSU Console</h1>
        ) : (
          <Breadcrumb>
            <BreadcrumbList className="flex-nowrap text-base">
              {trail.map((crumb, index) => (
                <React.Fragment key={crumb.title}>
                  {index > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem className="min-w-0">
                    {crumb.href ? (
                      <BreadcrumbLink asChild className="text-muted-foreground font-medium">
                        <Link href={crumb.href}>{crumb.title}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="font-semibold tracking-tight">{crumb.title}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>

      <Badge variant="secondary" className="hidden shrink-0 font-normal sm:inline-flex">
        {user.roleLabel}
      </Badge>
    </header>
  );
}
