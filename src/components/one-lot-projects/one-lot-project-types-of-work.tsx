import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { DistributionBarRow } from "./distribution-bar-row";
import { TYPES_OF_WORK_DUMMY } from "./dummy-data";

// Fixed categorical order — Task/Subtask/Bug are distinct identities, not an
// ordered scale, so each gets its own hue rather than opacity steps.
const CATEGORY_COLORS = ["bg-chart-1", "bg-chart-3", "bg-chart-2"];

/** Placeholder — work-item types come from the future Backlog/Kanban, see `dummy-data.ts`. */
export function OneLotProjectTypesOfWork() {
  const max = Math.max(1, ...TYPES_OF_WORK_DUMMY.map((row) => row.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Types of Work</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {TYPES_OF_WORK_DUMMY.map((row, index) => (
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
