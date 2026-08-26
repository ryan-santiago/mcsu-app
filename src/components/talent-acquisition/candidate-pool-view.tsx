"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, UserRoundX } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { fetchTaCandidatePool } from "@/server/talent-acquisition/candidate-actions";
import type { TaCandidateRow } from "@/server/talent-acquisition/candidate-types";

export function CandidatePoolView() {
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isPending } = useQuery<TaCandidateRow[]>({
    queryKey: ["ta-candidate-pool", debouncedSearch],
    queryFn: () => fetchTaCandidatePool(debouncedSearch),
    placeholderData: (previous) => previous,
  });

  const candidates = data ?? [];

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email, or mobile number"
          className="pl-9"
        />
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="w-32">CV</TableHead>
                <TableHead className="w-32">In pool since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              ) : candidates.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="p-0">
                    <EmptyState
                      icon={UserRoundX}
                      title="No one in the talent pool yet"
                      description="Candidates appear here once they're added to a Talent Acquisition request."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell>
                      <Link href={`/talent-acquisition/candidates/${candidate.id}`} className="font-medium hover:underline">
                        {formatEmployeeDisplayName(candidate)}
                      </Link>
                      {candidate.genderName ? <div className="text-muted-foreground text-xs">{candidate.genderName}</div> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {candidate.mobileNumber || candidate.personalEmail || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{candidate.cvFileName ? "Yes" : "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{format(candidate.createdAt, "MMM d, yyyy")}</TableCell>
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
