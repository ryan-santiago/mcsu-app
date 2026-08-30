"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TrendPoint } from "@/server/workforce-dashboard/types";

const WIDTH = 640;
const HEIGHT = 180;
const PAD_LEFT = 32;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

/** Same hand-rolled SVG line-chart technique as the One-Lot Projects sprint burndown (`one-lot-project-active-sprint-burndown.tsx`) — no charting library in this app yet, and one series over a handful of points doesn't need one. */
export function TrendLineChart({ points, ariaLabel = "Trend chart" }: { points: TrendPoint[]; ariaLabel?: string }) {
  if (points.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">No data in this range.</p>;
  }

  const maxY = Math.max(...points.map((p) => p.count), 1);
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const n = points.length;

  const scaleX = (i: number) => PAD_LEFT + (n === 1 ? plotWidth / 2 : (i / (n - 1)) * plotWidth);
  const scaleY = (value: number) => PAD_TOP + plotHeight - (value / maxY) * plotHeight;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(p.count)}`).join(" ");
  const areaPath = `${linePath} L ${scaleX(n - 1)} ${scaleY(0)} L ${scaleX(0)} ${scaleY(0)} Z`;

  // Thin out x-axis labels so they don't collide when there are many points (e.g. a 1-year range sampled monthly still fits, but a 3-month weekly range has ~13 points).
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel} className="w-full">
      {[0, 0.5, 1].map((frac) => (
        <line key={frac} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={scaleY(maxY * frac)} y2={scaleY(maxY * frac)} stroke="var(--border)" strokeWidth={1} />
      ))}

      <path d={areaPath} fill="var(--chart-1)" opacity={0.12} stroke="none" />
      <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {points.map((p, i) => (
        <Tooltip key={`${p.date}-${i}`}>
          <TooltipTrigger asChild>
            <circle cx={scaleX(i)} cy={scaleY(p.count)} r={3} fill="var(--chart-1)" tabIndex={0} aria-label={`${p.date}: ${p.count}`} />
          </TooltipTrigger>
          <TooltipContent>
            {p.date}: {p.count.toLocaleString()}
          </TooltipContent>
        </Tooltip>
      ))}

      {points.map((p, i) => {
        if (i % labelEvery !== 0 && i !== n - 1) return null;
        // The first/last labels would otherwise overflow past the viewBox
        // edge under center anchoring — anchor them inward instead.
        const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
        return (
          <text key={`label-${i}`} x={scaleX(i)} y={HEIGHT - 4} textAnchor={anchor} fontSize={10} fill="var(--muted-foreground)">
            {p.date}
          </text>
        );
      })}
    </svg>
  );
}
