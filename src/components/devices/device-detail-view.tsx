"use client";

import { useQuery } from "@tanstack/react-query";
import { Laptop, RotateCcw } from "lucide-react";

import { DeviceDeploymentHistoryTable } from "@/components/devices/device-deployment-history-table";
import { DeviceForm } from "@/components/devices/device-form";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDevice } from "@/server/devices/actions";
import { deviceQueryKey } from "@/server/devices/query-key";
import type { DeviceDetail } from "@/server/devices/types";

type DeviceDetailViewProps = {
  deviceId: string;
  canUpdate: boolean;
  canDelete: boolean;
};

export function DeviceDetailView({ deviceId, canUpdate, canDelete }: DeviceDetailViewProps) {
  const { data, isPending, isError, refetch } = useQuery<DeviceDetail | null>({
    queryKey: deviceQueryKey(deviceId),
    queryFn: () => fetchDevice(deviceId),
  });

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
        <p className="text-destructive text-sm">Could not load this device.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RotateCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={Laptop} title="Device not found" description="This record may have been removed." />;
  }

  return (
    <div className="space-y-6">
      <DeviceForm mode="edit" deviceId={deviceId} initialData={data} readOnly={!canUpdate} />
      <DeviceDeploymentHistoryTable deviceId={deviceId} records={data.deployments} canEdit={canUpdate} canDelete={canDelete} />
    </div>
  );
}
