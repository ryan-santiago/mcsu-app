import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BreakdownRow } from "@/server/one-lot-projects/backlog-types";

import { DistributionBarRow } from "./distribution-bar-row";

// Fixed categorical order — Task/Bug are distinct identities, not an ordered
// scale, so each gets its own hue rather than opacity steps. Subtasks are
// never a category here — they're always a child of a Task/Bug.
const CATEGORY_COLORS = ["bg-chart-1", "bg-chart-2"];

export function OneLotProjectTypesOfWork({ data }: { data: BreakdownRow[] }) {
  const max = Math.max(1, ...data.map((row) => row.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Types of Work</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((row, index) => (
          <DistributionBarRow
            key={row.label}
            label={row.label}
            value={row.value}
            pct={(row.value / max) * 100}
            barClassName={CATEGORY_COLORS[index] ?? "bg-chart-4"}
          />
        ))}
      </CardContent>
    </Card>
  );
}
