import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DeviceDetailView } from "@/components/devices/device-detail-view";
import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getDeviceById } from "@/server/devices/queries";
import { deviceQueryKey } from "@/server/devices/query-key";

type DeviceDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: DeviceDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const device = await getDeviceById(id);
  return { title: device ? `${device.brand} ${device.model}` : "Device" };
}

export default async function DeviceDetailPage({ params }: DeviceDetailPageProps) {
  const actor = await requirePermission("devices:read");
  const { id } = await params;

  const queryClient = new QueryClient();
  const device = await queryClient.fetchQuery({
    queryKey: deviceQueryKey(id),
    queryFn: () => getDeviceById(id),
  });

  if (!device) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        title="View / Edit Device"
        description="Update this device's profile and its deployment history."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <DeviceDetailView
          deviceId={id}
          canUpdate={can(actor, "devices:edit")}
          canDelete={can(actor, "devices:delete")}
        />
      </HydrationBoundary>
    </div>
  );
}
