import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { DevicesView } from "@/components/devices/devices-view";
import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listDevices } from "@/server/devices/queries";
import { devicesQueryKey } from "@/server/devices/query-key";
import type { DeviceFilters } from "@/server/devices/types";

export const metadata: Metadata = {
  title: "Device Inventory",
};

export default async function DevicesPage() {
  const actor = await requirePermission("devices:read");

  const initialFilters: DeviceFilters = {};

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: devicesQueryKey(initialFilters),
    queryFn: () => listDevices(initialFilters),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Device Inventory"
        description="Laptops and phones issued to employees, plus who's had each device over time."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <DevicesView
          initialFilters={initialFilters}
          canCreate={can(actor, "devices:write")}
          canDelete={can(actor, "devices:delete")}
        />
      </HydrationBoundary>
    </div>
  );
}
