import type { ReactNode } from "react";

type DistributionBarRowProps = {
  label: ReactNode;
  value: ReactNode;
  pct: number;
  barClassName: string;
  labelWidthClassName?: string;
};

/** One labeled horizontal bar row — shared visual for Priority Breakdown, Types of Work, and Team Workload. */
export function DistributionBarRow({
  label,
  value,
  pct,
  barClassName,
  labelWidthClassName = "w-24",
}: DistributionBarRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={`shrink-0 truncate text-sm ${labelWidthClassName}`}>{label}</div>
      <div className="bg-muted h-6 flex-1 overflow-hidden rounded-full">
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }} />
      </div>
      <div className="w-10 shrink-0 text-right text-sm tabular-nums">{value}</div>
    </div>
  );
}
