"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { Paperclip } from "lucide-react";

import { CandidateComments } from "@/components/talent-acquisition/candidate-comments";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes } from "@/lib/format";
import { fetchTaCandidateProfile } from "@/server/talent-acquisition/candidate-actions";
import type { TaApplicationRow } from "@/server/talent-acquisition/application-types";
import { TA_APPLICATION_STATUS_LABELS } from "@/server/talent-acquisition/application-types";
import { TA_STAGE_LABELS } from "@/server/talent-acquisition/stage-types";

const STATUS_BADGE_VARIANT: Record<TaApplicationRow["status"], "default" | "secondary" | "outline"> = {
  active: "default",
  hired: "secondary",
  rejected: "outline",
  withdrawn: "outline",
};

type CandidateProfileViewProps = {
  candidateId: string;
  canComment: boolean;
};

export function CandidateProfileView({ candidateId, canComment }: CandidateProfileViewProps) {
  const { data: profile, isPending } = useQuery({
    queryKey: ["ta-candidate-profile", candidateId],
    queryFn: () => fetchTaCandidateProfile(candidateId),
  });

  if (isPending || !profile) {
    return (
      <div className="bg-card space-y-4 rounded-xl border p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-card grid grid-cols-2 gap-4 rounded-xl border p-6 text-sm sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground text-xs">Mobile</p>
          <p className="mt-0.5">{profile.mobileNumber || "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Personal email</p>
          <p className="mt-0.5">{profile.personalEmail || "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Gender</p>
          <p className="mt-0.5">{profile.genderName || "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">CV</p>
          {profile.cvFileName ? (
            <a
              href={`/api/talent-acquisition/candidates/${profile.id}/cv`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand mt-0.5 inline-flex items-center gap-1 hover:underline"
            >
              <Paperclip className="size-3.5 shrink-0" aria-hidden />
              <span className="max-w-40 truncate">{profile.cvFileName}</span>
              <span className="text-muted-foreground shrink-0">({formatBytes(profile.cvSize)})</span>
            </a>
          ) : (
            <p className="mt-0.5">—</p>
          )}
        </div>
        <div>
          <p className="text-muted-foreground text-xs">In the pool since</p>
          <p className="mt-0.5">{format(profile.createdAt, "MMM d, yyyy")}</p>
        </div>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="border-b p-4">
          <h3 className="text-sm font-semibold">Application history ({profile.applications.length})</h3>
        </div>
        {profile.applications.length === 0 ? (
          <p className="text-muted-foreground p-6 text-sm">No applications yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Position / Level</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-28">Filed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profile.applications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell>
                      <Link href={`/talent-acquisition/${application.requestId}`} className="font-medium hover:underline">
                        {application.positionName} — {application.levelName}
                      </Link>
                    </TableCell>
                    <TableCell>{application.clientName}</TableCell>
                    <TableCell className="text-muted-foreground">{TA_STAGE_LABELS[application.currentStage]}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[application.status]} className="font-normal">
                        {TA_APPLICATION_STATUS_LABELS[application.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{format(application.createdAt, "MMM d, yyyy")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border p-6">
        <CandidateComments candidateId={candidateId} canComment={canComment} />
      </div>
    </div>
  );
}
