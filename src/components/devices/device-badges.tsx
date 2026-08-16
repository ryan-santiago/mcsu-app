import { Archive, CircleCheck, Laptop, Smartphone, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DeviceStatus, DeviceType } from "@/db/schema";
import { DEVICE_STATUS_LABELS, DEVICE_TYPE_LABELS } from "@/lib/device-format";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<DeviceType, LucideIcon> = {
  laptop: Laptop,
  phone: Smartphone,
};

/** Type is distinguished by icon and label, not colour — colour is reserved for Status, same convention as `RoleBadge`/`StatusBadge` in `src/components/users/user-badges.tsx`. */
export function DeviceTypeBadge({ deviceType, className }: { deviceType: DeviceType; className?: string }) {
  const Icon = TYPE_ICONS[deviceType];

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {DEVICE_TYPE_LABELS[deviceType]}
    </Badge>
  );
}

const STATUS_STYLES: Record<DeviceStatus, { icon: LucideIcon; className: string }> = {
  available: {
    icon: CircleCheck,
    className: "border-success/30 bg-success/10 text-success",
  },
  deployed: {
    icon: Laptop,
    className: "border-border text-foreground",
  },
  under_repair: {
    icon: Wrench,
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  retired: {
    icon: Archive,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

export function DeviceStatusBadge({ status, className }: { status: DeviceStatus; className?: string }) {
  const { icon: Icon, className: tone } = STATUS_STYLES[status];

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", tone, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {DEVICE_STATUS_LABELS[status]}
    </Badge>
  );
}
