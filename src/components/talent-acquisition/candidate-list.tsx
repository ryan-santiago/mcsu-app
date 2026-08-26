"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserRoundX } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ApplicationDetailSheet } from "@/components/talent-acquisition/application-detail-sheet";
import { CandidateFormDialog, type CandidateFormValues } from "@/components/talent-acquisition/candidate-form-dialog";
import { TaApplicationBoard } from "@/components/talent-acquisition/board/ta-application-board";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import {
  createTaApplication,
  createTaApplicationForCandidate,
  deleteTaApplication,
  fetchTaApplications,
  updateTaApplication,
} from "@/server/talent-acquisition/application-actions";
import { taApplicationsQueryKey } from "@/server/talent-acquisition/application-query-key";
import { TA_APPLICATION_STATUS_LABELS, type TaApplicationRow } from "@/server/talent-acquisition/application-types";

type CandidateListProps = {
  requestId: string;
  candidatesBlocked: boolean;
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

const STATUS_BADGE_VARIANT: Record<TaApplicationRow["status"], "default" | "secondary" | "outline"> = {
  active: "default",
  hired: "secondary",
  rejected: "outline",
  withdrawn: "outline",
};

export function CandidateList({
  requestId,
  candidatesBlocked,
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
  const [formTarget, setFormTarget] = React.useState<TaApplicationRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<TaApplicationRow | null>(null);
  const [openApplicationId, setOpenApplicationId] = React.useState<string | null>(null);

  const { data, isPending } = useQuery<TaApplicationRow[]>({
    queryKey: taApplicationsQueryKey(requestId),
    queryFn: () => fetchTaApplications(requestId),
    placeholderData: (previous) => previous,
  });

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: taApplicationsQueryKey(requestId) });
        setFormTarget(null);
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const applications = data ?? [];
  const activeApplications = applications.filter((application) => application.status === "active");
  const closedApplications = applications.filter((application) => application.status !== "active");

  function handleSubmit(values: CandidateFormValues) {
    if (formTarget === "new") {
      mutation.mutate(() => createTaApplication({ requestId, ...values }));
    } else if (formTarget) {
      mutation.mutate(() => updateTaApplication({ id: formTarget.id, requestId, ...values }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Candidates</h3>
        {canWrite ? (
          <Button size="sm" onClick={() => setFormTarget("new")} disabled={candidatesBlocked}>
            <Plus className="size-4" aria-hidden />
            Add candidate
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <div className="flex gap-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="bg-muted h-40 w-64 shrink-0 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-card overflow-hidden rounded-xl border">
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
        </div>
      ) : (
        <TaApplicationBoard
          requestId={requestId}
          applications={activeApplications}
          canMove={canEdit}
          onCardClick={setOpenApplicationId}
        />
      )}

      {closedApplications.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-muted-foreground text-xs font-medium">Not active ({closedApplications.length})</h4>
          <div className="bg-card overflow-hidden rounded-xl border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedApplications.map((application) => (
                    <TableRow
                      key={application.id}
                      className="cursor-pointer"
                      onClick={() => setOpenApplicationId(application.id)}
                    >
                      <TableCell className="font-medium">{formatEmployeeDisplayName(application)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {application.mobileNumber || application.personalEmail || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{application.sourceName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE_VARIANT[application.status]} className="font-normal">
                          {TA_APPLICATION_STATUS_LABELS[application.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ) : null}

      <ApplicationDetailSheet
        applicationId={openApplicationId}
        requestId={requestId}
        canWrite={canWrite}
        canEdit={canEdit}
        canDelete={canDelete}
        canL1Assess={canL1Assess}
        canL2Assess={canL2Assess}
        canFinalize={canFinalize}
        canMigrate={canMigrate}
        currentUserId={currentUserId}
        hasOverrideAccess={hasOverrideAccess}
        onOpenChange={(open) => !open && setOpenApplicationId(null)}
        onEdit={setFormTarget}
        onDelete={setDeleting}
      />

      <CandidateFormDialog
        target={formTarget}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setFormTarget(null)}
        onSubmit={handleSubmit}
        onSelectExisting={(candidateId) => mutation.mutate(() => createTaApplicationForCandidate({ candidateId, requestId }))}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{formatEmployeeDisplayName(deleting)}</span> will be
                  removed from this request, along with their pipeline history here. Their talent-pool record, CV, and
                  comments are kept.
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
                mutation.mutate(() => deleteTaApplication({ id: deleting.id, requestId }), {
                  onSuccess: (result) => {
                    if (result.ok) setOpenApplicationId(null);
                  },
                });
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
