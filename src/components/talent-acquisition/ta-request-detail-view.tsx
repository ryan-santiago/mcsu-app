"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import * as React from "react";
import { toast } from "sonner";

import { CandidateList } from "@/components/talent-acquisition/candidate-list";
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
import { RICH_TEXT_CONTENT_CLASSNAME } from "@/components/ui/rich-text-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { approveTaRequest, cancelTaRequest, fetchTaRequest, rejectTaRequest } from "@/server/talent-acquisition/actions";
import { taRequestQueryKey } from "@/server/talent-acquisition/query-key";
import { TA_REQUEST_STATUS_LABELS, WORK_SETUP_LABELS, type TaRequestRow } from "@/server/talent-acquisition/types";

type TaRequestDetailViewProps = {
  requestId: string;
  canWrite: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canL1Assess: boolean;
  canL2Assess: boolean;
  canFinalize: boolean;
  canMigrate: boolean;
  currentUserId: string;
  hasOverrideAccess: boolean;
};

const REQUEST_STATUS_BADGE_VARIANT: Record<TaRequestRow["status"], "default" | "secondary" | "outline"> = {
  pending_approval: "secondary",
  open: "default",
  partially_filled: "default",
  filled: "default",
  cancelled: "outline",
};

export function TaRequestDetailView({
  requestId,
  canWrite,
  canEdit,
  canDelete,
  canApprove,
  canL1Assess,
  canL2Assess,
  canFinalize,
  canMigrate,
  currentUserId,
  hasOverrideAccess,
}: TaRequestDetailViewProps) {
  const queryClient = useQueryClient();
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");

  const { data: request, isPending } = useQuery<TaRequestRow | null>({
    queryKey: taRequestQueryKey(requestId),
    queryFn: () => fetchTaRequest(requestId),
  });

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: taRequestQueryKey(requestId) });
        setConfirmingCancel(false);
        setRejecting(false);
        setRejectReason("");
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  if (isPending || !request) {
    return (
      <div className="bg-card space-y-4 rounded-xl border p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  const canCancel = canEdit && request.status !== "cancelled";
  const canReview = canApprove && request.status === "pending_approval";

  return (
    <div className="space-y-6">
      <div className="bg-card space-y-4 rounded-xl border p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">Status</dt>
              <dd className="mt-0.5">
                <Badge variant={REQUEST_STATUS_BADGE_VARIANT[request.status]} className="font-normal">
                  {TA_REQUEST_STATUS_LABELS[request.status]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Headcount</dt>
              <dd className="mt-0.5 tabular-nums">
                {request.headcountFilled} / {request.headcountNeeded}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Work setup</dt>
              <dd className="mt-0.5">
                {WORK_SETUP_LABELS[request.workSetup]}
                {request.workSetupDetail ? (
                  <span className="text-muted-foreground"> — {request.workSetupDetail}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Requested by</dt>
              <dd className="mt-0.5">{request.requestedBy?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Filed</dt>
              <dd className="mt-0.5">{format(request.createdAt, "MMM d, yyyy")}</dd>
            </div>
          </dl>

          <div className="flex gap-2">
            {canReview ? (
              <>
                <Button variant="outline" size="sm" disabled={mutation.isPending} onClick={() => setRejecting(true)}>
                  Reject
                </Button>
                <Button
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(() => approveTaRequest({ id: requestId }))}
                >
                  Approve
                </Button>
              </>
            ) : canCancel ? (
              <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(true)}>
                Cancel request
              </Button>
            ) : null}
          </div>
        </div>

        {request.status === "cancelled" && request.reviewNote ? (
          <div className="border-t pt-4">
            <p className="text-muted-foreground text-xs">Rejection reason</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{request.reviewNote}</p>
          </div>
        ) : null}

        {request.notes ? (
          <div className="border-t pt-4">
            <p className="text-muted-foreground text-xs">Notes</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{request.notes}</p>
          </div>
        ) : null}
      </div>

      {request.jobDescription || request.jobQualification ? (
        <div className="bg-card space-y-4 rounded-xl border p-6">
          {request.jobDescription ? (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium">Job description</p>
              <div
                className={cn(RICH_TEXT_CONTENT_CLASSNAME)}
                dangerouslySetInnerHTML={{ __html: request.jobDescription }}
              />
            </div>
          ) : null}
          {request.jobQualification ? (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium">Job qualification</p>
              <div
                className={cn(RICH_TEXT_CONTENT_CLASSNAME)}
                dangerouslySetInnerHTML={{ __html: request.jobQualification }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <CandidateList
        requestId={requestId}
        candidatesBlocked={request.status === "cancelled" || request.status === "pending_approval"}
        canWrite={canWrite}
        canEdit={canEdit}
        canDelete={canDelete}
        canL1Assess={canL1Assess}
        canL2Assess={canL2Assess}
        canFinalize={canFinalize}
        canMigrate={canMigrate}
        currentUserId={currentUserId}
        hasOverrideAccess={hasOverrideAccess}
      />

      <AlertDialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-foreground font-medium">
                {request.positionName} — {request.levelName}
              </span>{" "}
              for {request.clientName} will be marked cancelled. This doesn&apos;t remove any candidates already added.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Keep request</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate(() => cancelTaRequest({ id: requestId }));
              }}
            >
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rejecting}
        onOpenChange={(open) => {
          setRejecting(open);
          if (!open) setRejectReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this request?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-foreground font-medium">
                {request.positionName} — {request.levelName}
              </span>{" "}
              for {request.clientName} will be marked cancelled. Let the requester know why.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Reason for rejecting"
            rows={3}
            disabled={mutation.isPending}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Keep pending</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutation.isPending || !rejectReason.trim()}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate(() => rejectTaRequest({ id: requestId, reviewNote: rejectReason }));
              }}
            >
              Reject request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
