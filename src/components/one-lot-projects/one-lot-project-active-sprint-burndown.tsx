"use client";

import { TrendingDown } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BurndownData } from "@/server/one-lot-projects/backlog-types";

const WIDTH = 560;
const HEIGHT = 200;
const PAD_LEFT = 28;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 12;

type OneLotProjectActiveSprintBurndownProps = {
  data: BurndownData;
};

/**
 * Remaining vs. ideal story points, one point per day from the sprint's
 * start through today. There's no per-item completion timestamp, so
 * "remaining" is approximated from `updatedAt` on items already in a Done
 * column — see `getOneLotProjectActiveSprintBurndown`'s doc comment.
 */
export function OneLotProjectActiveSprintBurndown({ data }: OneLotProjectActiveSprintBurndownProps) {
  if (!data.sprint) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Sprint Burndown</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={TrendingDown}
            title="No active sprint"
            description="Start a sprint from the Backlog tab to see its burndown here."
          />
        </CardContent>
      </Card>
    );
  }

  if (data.points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Active Sprint Burndown
            <span className="text-muted-foreground text-xs font-normal">{data.sprint.name}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={TrendingDown}
            title="No dates set"
            description="Set a start and end date for this sprint to see its burndown."
          />
        </CardContent>
      </Card>
    );
  }

  const maxY = Math.max(data.totalPoints, 1);
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const n = data.points.length;

  const scaleX = (i: number) => PAD_LEFT + (n === 1 ? plotWidth / 2 : (i / (n - 1)) * plotWidth);
  const scaleY = (value: number) => PAD_TOP + plotHeight - (value / maxY) * plotHeight;

  const idealPath = data.points.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(p.ideal)}`).join(" ");
  const remainingPath = data.points.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(p.remaining)}`).join(" ");

  const last = data.points[data.points.length - 1];
  const onTrack = last.remaining <= last.ideal + 0.001;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Active Sprint Burndown
          <span className="text-muted-foreground text-xs font-normal">{data.sprint.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="bg-chart-1 h-0.5 w-4 shrink-0 rounded-full" aria-hidden />
            Remaining
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="border-muted-foreground h-0 w-4 shrink-0 border-t-2 border-dashed"
              aria-hidden
            />
            Ideal pace
          </span>
          <span className={cn("ml-auto font-medium", onTrack ? "text-success" : "text-warning")}>
            {onTrack ? "On track" : "Behind pace"}
          </span>
        </div>

        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Active sprint burndown chart" className="w-full">
          {[0, 0.5, 1].map((frac) => (
            <line
              key={frac}
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={scaleY(maxY * frac)}
              y2={scaleY(maxY * frac)}
              stroke="var(--border)"
              strokeWidth={1}
            />
          ))}

          <path d={idealPath} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} strokeDasharray="4 3" strokeLinecap="round" />
          <path d={remainingPath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" />

          {data.points.map((p, i) => (
            <Tooltip key={p.date}>
              <TooltipTrigger asChild>
                <circle
                  cx={scaleX(i)}
                  cy={scaleY(p.remaining)}
                  r={4}
                  fill="var(--chart-1)"
                  tabIndex={0}
                  aria-label={`${formatDate(p.date)}: ${p.remaining} remaining, ${Math.round(p.ideal)} ideal`}
                />
              </TooltipTrigger>
              <TooltipContent>
                {formatDate(p.date)} — {p.remaining} remaining (ideal {Math.round(p.ideal)})
              </TooltipContent>
            </Tooltip>
          ))}
        </svg>

        <div className="text-muted-foreground flex justify-between text-xs">
          <span>{formatDate(data.points[0].date)}</span>
          <span className="tabular-nums">{data.totalPoints} pts total</span>
          <span>{formatDate(last.date)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
