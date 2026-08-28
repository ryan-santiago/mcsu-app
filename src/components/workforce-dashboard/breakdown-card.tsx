import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DistributionBarRow } from "@/components/one-lot-projects/distribution-bar-row";
import type { BreakdownRow } from "@/server/workforce-dashboard/types";

type BreakdownCardProps = {
  title: string;
  rows: BreakdownRow[];
  emptyLabel: string;
  barClassName?: string;
};

/** Reuses `DistributionBarRow` — the same horizontal-bar-list visual One-Lot Projects already built for Priority/Type/Workload breakdowns — rather than a second implementation of the same idea. */
export function BreakdownCard({ title, rows, emptyLabel, barClassName = "bg-chart-1" }: BreakdownCardProps) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const sorted = [...rows].sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyLabel}</p>
        ) : (
          sorted.map((row) => (
            <DistributionBarRow
              key={row.label}
              label={row.label}
              value={row.count}
              pct={(row.count / max) * 100}
              barClassName={barClassName}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
