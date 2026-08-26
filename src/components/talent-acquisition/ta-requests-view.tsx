"use client";

import { useQuery } from "@tanstack/react-query";
import { UserSearch } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchTaRequests } from "@/server/talent-acquisition/actions";
import { taRequestsQueryKey } from "@/server/talent-acquisition/query-key";
import { TA_REQUEST_STATUS_LABELS, WORK_SETUP_LABELS, type TaRequestRow } from "@/server/talent-acquisition/types";

type TaRequestsViewProps = {
  canWrite: boolean;
};

const STATUS_BADGE_VARIANT: Record<TaRequestRow["status"], "default" | "secondary" | "outline"> = {
  open: "default",
  partially_filled: "secondary",
  filled: "secondary",
  cancelled: "outline",
};

export function TaRequestsView({ canWrite }: TaRequestsViewProps) {
  const { data, isPending } = useQuery<TaRequestRow[]>({
    queryKey: taRequestsQueryKey(),
    queryFn: fetchTaRequests,
    placeholderData: (previous) => previous,
  });

  const requests = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {requests.length} request{requests.length === 1 ? "" : "s"}
        </p>
        {canWrite ? (
          <Button size="sm" asChild>
            <Link href="/talent-acquisition/new">New request</Link>
          </Button>
        ) : null}
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Position / Level</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="w-28">Headcount</TableHead>
                <TableHead>Work Setup</TableHead>
                <TableHead className="w-36">Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : requests.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={UserSearch}
                      title="No requests yet"
                      description={
                        canWrite
                          ? "File a request to start sourcing candidates for a role."
                          : "Requests appear here once a Manager files one."
                      }
                      action={
                        canWrite ? (
                          <Button size="sm" asChild>
                            <Link href="/talent-acquisition/new">New request</Link>
                          </Button>
                        ) : undefined
                      }
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <Link href={`/talent-acquisition/${request.id}`} className="font-medium hover:underline">
                        {request.positionName} — {request.levelName}
                      </Link>
                    </TableCell>
                    <TableCell>{request.clientName}</TableCell>
                    <TableCell className="tabular-nums">
                      {request.headcountFilled} / {request.headcountNeeded}
                    </TableCell>
                    <TableCell>{WORK_SETUP_LABELS[request.workSetup]}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[request.status]} className="font-normal">
                        {TA_REQUEST_STATUS_LABELS[request.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
