import { CircleCheck, CircleSlash, Clock3, ShieldCheck, UserCog, Wrench, Eye, ShieldQuestion } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { UserStatus } from "@/db/schema";
import { STATUS_LABELS } from "@/lib/rbac";
import { cn } from "@/lib/utils";

/** The four built-in roles keep dedicated icons; any custom role falls back to a generic one. */
const ROLE_ICONS: Record<string, LucideIcon> = {
  admin: ShieldCheck,
  manager: UserCog,
  engineer: Wrench,
  viewer: Eye,
};

const DEFAULT_ROLE_ICON = ShieldQuestion;

/**
 * Roles are distinguished by icon and label rather than by colour alone —
 * colour is reserved for status, where it carries the urgent signal.
 */
export function RoleBadge({
  role,
  className,
}: {
  role: { id: string; label: string };
  className?: string;
}) {
  const Icon = ROLE_ICONS[role.id] ?? DEFAULT_ROLE_ICON;

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {role.label}
    </Badge>
  );
}

const STATUS_STYLES: Record<UserStatus, { icon: LucideIcon; className: string }> = {
  pending: {
    icon: Clock3,
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  active: {
    icon: CircleCheck,
    className: "border-success/30 bg-success/10 text-success",
  },
  suspended: {
    icon: CircleSlash,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

export function StatusBadge({ status, className }: { status: UserStatus; className?: string }) {
  const { icon: Icon, className: tone } = STATUS_STYLES[status];

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", tone, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
