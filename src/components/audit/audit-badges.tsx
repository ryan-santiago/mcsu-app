import {
  CircleCheck,
  CircleSlash,
  FolderMinus,
  FolderPlus,
  Kanban,
  KeyRound,
  LogIn,
  Pencil,
  PlusCircle,
  ShieldQuestion,
  Trash2,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AUDIT_MODULES } from "@/lib/audit-registry";
import { cn } from "@/lib/utils";

const MODULE_ICONS: Record<string, LucideIcon> = {
  users: Users,
  auth: KeyRound,
  one_lot_projects: Kanban,
};

const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  AUDIT_MODULES.map((m) => [m.value, m.label]),
);

/** Falls back to the raw module string for any future module not yet in the registry. */
export function ModuleBadge({ module, className }: { module: string; className?: string }) {
  const Icon = MODULE_ICONS[module] ?? ShieldQuestion;

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {MODULE_LABELS[module] ?? module}
    </Badge>
  );
}

type ActionMeta = { label: string; icon: LucideIcon; className: string };

const ACTION_META: Record<string, ActionMeta> = {
  created: { label: "Created", icon: PlusCircle, className: "border-success/30 bg-success/10 text-success" },
  approved: { label: "Approved", icon: CircleCheck, className: "border-success/30 bg-success/10 text-success" },
  reinstated: { label: "Reinstated", icon: UserCheck, className: "border-success/30 bg-success/10 text-success" },
  updated: { label: "Updated", icon: Pencil, className: "border-brand/30 bg-brand/10 text-brand" },
  role_changed: { label: "Role changed", icon: UserCog, className: "border-warning/30 bg-warning/10 text-warning" },
  rejected: { label: "Rejected", icon: XCircle, className: "border-destructive/30 bg-destructive/10 text-destructive" },
  suspended: { label: "Suspended", icon: CircleSlash, className: "border-destructive/30 bg-destructive/10 text-destructive" },
  deleted: { label: "Deleted", icon: Trash2, className: "border-destructive/30 bg-destructive/10 text-destructive" },
  login: { label: "Signed in", icon: LogIn, className: "border-border bg-muted text-muted-foreground" },
  member_added: { label: "Member added", icon: UserPlus, className: "border-success/30 bg-success/10 text-success" },
  member_removed: {
    label: "Member removed",
    icon: UserMinus,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  s3p_project_linked: {
    label: "S3P project linked",
    icon: FolderPlus,
    className: "border-success/30 bg-success/10 text-success",
  },
  s3p_project_unlinked: {
    label: "S3P project unlinked",
    icon: FolderMinus,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

/** Falls back to a neutral badge with the raw action string for anything not yet in the map. */
export function ActionBadge({ action, className }: { action: string; className?: string }) {
  const meta = ACTION_META[action] ?? {
    label: action,
    icon: ShieldQuestion,
    className: "border-border bg-muted text-muted-foreground",
  };
  const Icon = meta.icon;

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", meta.className, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {meta.label}
    </Badge>
  );
}
