import { FolderKanban } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OneLotProjectRollupRow } from "@/server/engagement-dashboard/types";

type OneLotProjectsTableProps = {
  projects: OneLotProjectRollupRow[];
};

/** One row per visible One-Lot project — the bird's-eye view across projects the per-project Summary page can't give you. */
export function OneLotProjectsTable({ projects }: OneLotProjectsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
            <FolderKanban className="size-6" aria-hidden />
            No projects yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Sprints</TableHead>
                <TableHead className="text-right">Work items</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">
                    <Link href={`/one-lot-projects/${project.id}/dashboard`} className="hover:underline">
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="text-warning">{project.activeSprints} active</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{project.plannedSprints} planned</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-success">{project.completedSprints} done</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{project.workItemCount.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{project.storyPoints.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{project.memberCount.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
