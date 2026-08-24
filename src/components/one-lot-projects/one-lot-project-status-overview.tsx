"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { columnColor } from "@/lib/one-lot-project-backlog-format";
import type { BreakdownRow } from "@/server/one-lot-projects/backlog-types";

const SIZE = 160;
const CENTER = SIZE / 2;
const RADIUS = 60;
const STROKE = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP_DEG = 3;

type Arc = { label: string; value: number; color: string; rotate: number; segLen: number };

function computeArcs(rows: { label: string; value: number }[], total: number): Arc[] {
  const segments = rows.filter((row) => row.value > 0);

  let cursorDeg = 0;
  return segments.map((row, index) => {
    const segDeg = total > 0 ? (row.value / total) * 360 : 0;
    const gapDeg = segments.length > 1 ? GAP_DEG : 0;
    const drawDeg = Math.max(segDeg - gapDeg, 0);
    const segLen = (drawDeg / 360) * CIRCUMFERENCE;
    const rotate = cursorDeg - 90;
    cursorDeg += segDeg;

    return { label: row.label, value: row.value, color: columnColor(index), rotate, segLen };
  });
}

export function OneLotProjectStatusOverview({ data }: { data: BreakdownRow[] }) {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const arcs = computeArcs(data, total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status Overview</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Status overview donut chart">
            <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
            {arcs.map((arc) => (
              <Tooltip key={arc.label}>
                <TooltipTrigger asChild>
                  <circle
                    cx={CENTER}
                    cy={CENTER}
                    r={RADIUS}
                    fill="none"
                    stroke={arc.color}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    strokeDasharray={`${arc.segLen} ${CIRCUMFERENCE - arc.segLen}`}
                    transform={`rotate(${arc.rotate} ${CENTER} ${CENTER})`}
                    tabIndex={0}
                    aria-label={`${arc.label}: ${arc.value} (${Math.round((arc.value / total) * 100)}%)`}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {arc.label} — {arc.value} ({Math.round((arc.value / total) * 100)}%)
                </TooltipContent>
              </Tooltip>
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums">{total}</span>
            <span className="text-muted-foreground text-xs">Total work items</span>
          </div>
        </div>

        <ul className="w-full space-y-1.5">
          {data.map((row, index) => (
            <li key={row.label} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: columnColor(index) }}
                  aria-hidden
                />
                <span className="truncate">{row.label}</span>
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">{row.value}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
