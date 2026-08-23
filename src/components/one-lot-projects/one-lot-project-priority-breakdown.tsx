import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { DistributionBarRow } from "./distribution-bar-row";
import { PRIORITY_BREAKDOWN_DUMMY } from "./dummy-data";

// Priority is ordinal, not identity — one hue stepped light→dark (darkest =
// most urgent) reads correctly as a severity scale, unlike 5 distinct
// categorical colors which would imply unrelated categories.
const OPACITY_STEPS = ["/100", "/80", "/60", "/40", "/20"];

/** Placeholder — priority levels come from the future Kanban Board, see `dummy-data.ts`. */
export function OneLotProjectPriorityBreakdown() {
  const max = Math.max(1, ...PRIORITY_BREAKDOWN_DUMMY.map((row) => row.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Priority Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {PRIORITY_BREAKDOWN_DUMMY.map((row, index) => (
          <DistributionBarRow
            key={row.label}
            label={row.label}
            value={row.value}
            pct={(row.value / max) * 100}
            barClassName={`bg-chart-1${OPACITY_STEPS[index] ?? ""}`}
          />
        ))}
      </CardContent>
    </Card>
  );
}
