"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UserCheck,
  UserRoundX,
  UserX,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { CandidateComments } from "@/components/talent-acquisition/candidate-comments";
import { CandidateFormDialog, type CandidateFormValues } from "@/components/talent-acquisition/candidate-form-dialog";
import { StageChecklist } from "@/components/talent-acquisition/stage-checklist";
import { EmptyState } from "@/components/layout/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { formatBytes } from "@/lib/format";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import {
  createTaCandidate,
  deleteTaCandidate,
  fetchTaCandidates,
  setTaCandidateStatus,
  updateTaCandidate,
  uploadTaCandidateCv,
} from "@/server/talent-acquisition/candidate-actions";
import { taCandidatesQueryKey } from "@/server/talent-acquisition/candidate-query-key";
import { TA_CANDIDATE_STATUS_LABELS, type TaCandidateRow } from "@/server/talent-acquisition/candidate-types";

type CandidateListProps = {
  requestId: string;
  requestCancelled: boolean;
  canWrite: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canL1Assess: boolean;
  canL2Assess: boolean;
  canFinalize: boolean;
  canMigrate: boolean;
  currentUserId: string;
  hasOverrideAccess: boolean;
};

const STATUS_BADGE_VARIANT: Record<TaCandidateRow["status"], "default" | "secondary" | "outline"> = {
  active: "default",
  hired: "secondary",
  rejected: "outline",
  withdrawn: "outline",
};

export function CandidateList({
  requestId,
  requestCancelled,
  canWrite,
  canEdit,
  canDelete,
  canL1Assess,
  canL2Assess,
  canFinalize,
  canMigrate,
  currentUserId,
  hasOverrideAccess,
}: CandidateListProps) {
  const queryClient = useQueryClient();
  const [formTarget, setFormTarget] = React.useState<TaCandidateRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<TaCandidateRow | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const { data, isPending } = useQuery<TaCandidateRow[]>({
    queryKey: taCandidatesQueryKey(requestId),
    queryFn: () => fetchTaCandidates(requestId),
    placeholderData: (previous) => previous,
  });

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: taCandidatesQueryKey(requestId) });
        setFormTarget(null);
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const candidates = data ?? [];
  const canManage = canEdit || canDelete || canMigrate;

  function handleSubmit(values: CandidateFormValues) {
    if (formTarget === "new") {
      mutation.mutate(() => createTaCandidate({ requestId, ...values }));
    } else if (formTarget) {
      mutation.mutate(() => updateTaCandidate({ id: formTarget.id, requestId, ...values }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Candidates</h3>
        {canWrite ? (
          <Button size="sm" onClick={() => setFormTarget("new")} disabled={requestCancelled}>
            <Plus className="size-4" aria-hidden />
            Add candidate
          </Button>
        ) : null}
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" aria-label="Expand" />
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>CV</TableHead>
                <TableHead className="w-28">Status</TableHead>
                {canManage ? <TableHead className="w-12" aria-label="Actions" /> : null}
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 2 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell />
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    {canManage ? <TableCell /> : null}
                  </TableRow>
                ))
              ) : candidates.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6 + (canManage ? 1 : 0)} className="p-0">
                    <EmptyState
                      icon={UserRoundX}
                      title="No candidates yet"
                      description={
                        canWrite
                          ? "Add the first candidate sourced for this request."
                          : "Candidates appear here once Talent Acquisition adds one."
                      }
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map((candidate) => {
                  const expanded = expandedId === candidate.id;
                  return (
                    <React.Fragment key={candidate.id}>
                      <CandidateRow
                        candidate={candidate}
                        requestId={requestId}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        canMigrate={canMigrate}
                        disabled={mutation.isPending}
                        expanded={expanded}
                        onToggleExpand={() => setExpandedId(expanded ? null : candidate.id)}
                        onEdit={() => setFormTarget(candidate)}
                        onDelete={() => setDeleting(candidate)}
                        onSetStatus={(status) =>
                          mutation.mutate(() => setTaCandidateStatus({ id: candidate.id, requestId, status }))
                        }
                      />
                      {expanded ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6 + (canManage ? 1 : 0)} className="bg-muted/30 p-4">
                            <div className="grid gap-6 sm:grid-cols-2">
                              <StageChecklist
                                candidateId={candidate.id}
                                requestId={requestId}
                                clientInterviewRequired={candidate.clientInterviewRequired}
                                currentUserId={currentUserId}
                                isAdmin={hasOverrideAccess}
                                canL1Assess={canL1Assess}
                                canAssignL2={canEdit}
                                canL2Assess={canL2Assess}
                                canFinalize={canFinalize}
                              />
                              <CandidateComments requestId={requestId} candidateId={candidate.id} canComment={canWrite} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <CandidateFormDialog
        target={formTarget}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setFormTarget(null)}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{formatEmployeeDisplayName(deleting)}</span> will be
                  permanently removed, along with their CV, pipeline history, and comments.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleting) return;
                mutation.mutate(() => deleteTaCandidate({ id: deleting.id, requestId }));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CandidateRow({
  candidate,
  requestId,
  canEdit,
  canDelete,
  canMigrate,
  disabled,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onSetStatus,
}: {
  candidate: TaCandidateRow;
  requestId: string;
  canEdit: boolean;
  canDelete: boolean;
  canMigrate: boolean;
  disabled: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetStatus: (status: "active" | "rejected" | "withdrawn") => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("candidateId", candidate.id);
      formData.append("requestId", requestId);
      formData.append("file", file);
      return uploadTaCandidateCv(formData);
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: taCandidatesQueryKey(requestId) });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const canManage = canEdit || canDelete || canMigrate;
  const isBusy = disabled || uploadMutation.isPending;
  const fullName = formatEmployeeDisplayName(candidate);

  return (
    <TableRow className={isBusy ? "opacity-70" : undefined}>
      <TableCell>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={expanded ? `Collapse ${fullName}` : `Expand ${fullName}`}
          onClick={onToggleExpand}
        >
          <ChevronRight className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
        </Button>
      </TableCell>
      <TableCell>
        <div className="font-medium">{fullName}</div>
        {candidate.genderName ? <div className="text-muted-foreground text-xs">{candidate.genderName}</div> : null}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {candidate.mobileNumber || candidate.personalEmail ? (
          <>
            {candidate.mobileNumber ? <div>{candidate.mobileNumber}</div> : null}
            {candidate.personalEmail ? <div>{candidate.personalEmail}</div> : null}
          </>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{candidate.sourceName ?? "—"}</TableCell>
      <TableCell>
        {candidate.cvFileName ? (
          <a
            href={`/api/talent-acquisition/candidates/${candidate.id}/cv`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand inline-flex items-center gap-1 text-xs hover:underline"
          >
            <Paperclip className="size-3.5 shrink-0" aria-hidden />
            <span className="max-w-32 truncate">{candidate.cvFileName}</span>
            <span className="text-muted-foreground shrink-0">({formatBytes(candidate.cvSize)})</span>
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_BADGE_VARIANT[candidate.status]} className="font-normal">
          {TA_CANDIDATE_STATUS_LABELS[candidate.status]}
        </Badge>
      </TableCell>
      {canManage ? (
        <TableCell>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              event.target.value = "";
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isBusy} aria-label={`Actions for ${fullName}`}>
                {uploadMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <MoreHorizontal className="size-4" aria-hidden />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit ? (
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </DropdownMenuItem>
              ) : null}
              {canEdit ? (
                <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                  <Upload className="size-4" aria-hidden />
                  {candidate.cvFileName ? "Replace CV" : "Upload CV"}
                </DropdownMenuItem>
              ) : null}
              {canMigrate && candidate.status === "active" && !candidate.employeeId ? (
                <DropdownMenuItem asChild>
                  <Link href={`/talent-acquisition/${requestId}/candidates/${candidate.id}/migrate`}>
                    <UserCheck className="size-4" aria-hidden />
                    Migrate to Employee
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {canEdit && candidate.status !== "hired" ? (
                candidate.status === "active" ? (
                  <>
                    <DropdownMenuItem onSelect={() => onSetStatus("rejected")}>
                      <UserX className="size-4" aria-hidden />
                      Mark rejected
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onSetStatus("withdrawn")}>
                      <UserRoundX className="size-4" aria-hidden />
                      Mark withdrawn
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onSelect={() => onSetStatus("active")}>
                    <RotateCcw className="size-4" aria-hidden />
                    Reactivate
                  </DropdownMenuItem>
                )
              ) : null}
              {canDelete ? (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      ) : null}
    </TableRow>
  );
}
