import type { DeviceStatus, DeviceType } from "@/db/schema";

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  laptop: "Laptop",
  phone: "Phone",
};

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  available: "Available",
  deployed: "Deployed",
  under_repair: "Under Repair",
  retired: "Retired",
};
