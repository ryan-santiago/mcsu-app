import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { initialsOf } from "@/lib/format";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

import { DistributionBarRow } from "./distribution-bar-row";

type WorkloadRow = { name: string; image: string | null; pct: number };

/**
 * Even split across current members — there's no real task assignment yet
 * (Backlog/Kanban don't exist), so this is a placeholder distribution over
 * real people rather than fabricated names. The last row absorbs the
 * rounding remainder so percentages always sum to exactly 100.
 */
function computeWorkload(members: OneLotProjectMemberRow[]): WorkloadRow[] {
  if (members.length === 0) return [{ name: "Unassigned", image: null, pct: 100 }];

  const share = Math.floor(100 / members.length);
  return members.map((member, index) => ({
    name: member.name,
    image: member.image,
    pct: index === members.length - 1 ? 100 - share * (members.length - 1) : share,
  }));
}

type OneLotProjectTeamWorkloadProps = {
  members: OneLotProjectMemberRow[];
};

export function OneLotProjectTeamWorkload({ members }: OneLotProjectTeamWorkloadProps) {
  const workload = computeWorkload(members);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Workload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {workload.map((row) => (
          <DistributionBarRow
            key={row.name}
            labelWidthClassName="w-40"
            label={
              <span className="flex items-center gap-2">
                <Avatar size="sm">
                  <AvatarImage src={row.image ?? undefined} alt="" />
                  <AvatarFallback>{row.name === "Unassigned" ? "—" : initialsOf(row.name)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{row.name}</span>
              </span>
            }
            value={`${row.pct}%`}
            pct={row.pct}
            barClassName="bg-muted-foreground/40"
          />
        ))}
      </CardContent>
    </Card>
  );
}
