import type { Metadata } from "next";

import { DeviceForm } from "@/components/devices/device-form";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = {
  title: "Add device",
};

export default async function NewDevicePage() {
  await requirePermission("devices:write");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        title="Add device"
        description="Save the device first — deployment history can be added once the record exists."
      />

      <DeviceForm mode="create" />
    </div>
  );
}
