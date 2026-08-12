import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { MaintenanceView } from "@/components/maintenance/maintenance-view";
import { canAny } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listLookup } from "@/server/maintenance/queries";
import { lookupQueryKey } from "@/server/maintenance/query-key";

export const metadata: Metadata = {
  title: "Maintenance",
};

/**
 * Only the first tab (Clients) is prefetched — same reasoning as User
 * Management's status tabs: the rest fetch client-side via TanStack Query
 * when selected, rather than paying for five prefetches up front.
 */
export default async function MaintenancePage() {
  const actor = await requirePermission("maintenance:read");

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: lookupQueryKey("client"),
    queryFn: () => listLookup("client"),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Maintenance"
        description="Manage the Client, Position, Level, Gender and Team lists used across employee records."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <MaintenanceView
          canManage={canAny(actor, ["maintenance:write", "maintenance:edit", "maintenance:delete"])}
        />
      </HydrationBoundary>
    </div>
  );
}
