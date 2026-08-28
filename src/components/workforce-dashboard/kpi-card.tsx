import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type KpiCardProps = {
  icon: LucideIcon;
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "success" | "warning";
};

const TONE_CLASSNAME: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
};

/** One number, one label, one small icon — the smallest unit of this dashboard, repeated across every section. */
export function KpiCard({ icon: Icon, label, value, hint, tone = "default" }: KpiCardProps) {
  return (
    <div className="bg-card space-y-1 rounded-xl border p-4">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </div>
      <p className={cn("text-2xl font-semibold tabular-nums", TONE_CLASSNAME[tone])}>{value.toLocaleString()}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}
