"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ScorecardPanel } from "@/components/talent-acquisition/scorecard-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { formatRelative } from "@/lib/format";
import { taApplicationsQueryKey } from "@/server/talent-acquisition/application-query-key";
import {
  assignL2Assessment,
  completeClientInterview,
  completeFinalInterview,
  completeL1Assessment,
  completeL2Assessment,
  completeL3Assessment,
  fetchL2AssigneeOptions,
  fetchTaApplicationStages,
  moveApplicationStage,
} from "@/server/talent-acquisition/stage-actions";
import { taApplicationStagesQueryKey } from "@/server/talent-acquisition/stage-query-key";
import { TA_STAGE_ORDER } from "@/server/talent-acquisition/stage-order";
import {
  TA_STAGE_LABELS,
  TA_STAGE_STATUS_LABELS,
  type TaApplicationStageRow,
  type UserOption,
} from "@/server/talent-acquisition/stage-types";
import type { TaStage } from "@/db/schema";

function applicableStages(clientInterviewRequired: boolean): TaStage[] {
  return TA_STAGE_ORDER.filter((stage) => stage !== "client_interview" || clientInterviewRequired);
}

const STATUS_BADGE_VARIANT: Record<TaApplicationStageRow["status"], "default" | "secondary" | "outline"> = {
  pending: "outline",
  in_progress: "secondary",
  passed: "default",
  failed: "outline",
  skipped: "outline",
};

type StageChecklistProps = {
  applicationId: string;
  requestId: string;
  clientInterviewRequired: boolean;
  currentUserId: string;
  isAdmin: boolean;
  canL1Assess: boolean;
  canAssignL2: boolean;
  canL2Assess: boolean;
  canL3Assess: boolean;
  canFinalize: boolean;
  /** May move this application to a not-yet-started stage — the flexible, non-linear part of the pipeline. */
  canMove: boolean;
};

export function StageChecklist({
  applicationId,
  requestId,
  clientInterviewRequired,
  currentUserId,
  isAdmin,
  canL1Assess,
  canAssignL2,
  canL2Assess,
  canL3Assess,
  canFinalize,
  canMove,
}: StageChecklistProps) {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery<TaApplicationStageRow[]>({
    queryKey: taApplicationStagesQueryKey(applicationId),
    queryFn: () => fetchTaApplicationStages(applicationId),
  });

  const assigneeOptions = useQuery<UserOption[]>({
    queryKey: ["ta-application-stages", "l2-assignee-options"],
    queryFn: fetchL2AssigneeOptions,
    enabled: canAssignL2,
  });

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: taApplicationStagesQueryKey(applicationId) });
        void queryClient.invalidateQueries({ queryKey: taApplicationsQueryKey(requestId) });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const stages = data ?? [];
  const stageByKey = new Map(stages.map((row) => [row.stage, row]));
  const order = applicableStages(clientInterviewRequired);

  if (isPending) {
    return <p className="text-muted-foreground text-sm">Loading pipeline…</p>;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-muted-foreground text-xs font-medium">Pipeline</h4>

      <ol className="space-y-2">
        {order.map((stage) => {
          const row = stageByKey.get(stage);
          const completed = row?.status === "passed" || row?.status === "failed";
          const notStarted = !row && stage !== "l1_assessment" && stage !== "l2_assessment";
          const canScore =
            stage === "l1_assessment"
              ? canL1Assess
              : stage === "l3_assessment"
                ? canL3Assess
                : stage === "final_interview"
                  ? canFinalize
                  : canL2Assess;

          return (
            <li key={stage} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{TA_STAGE_LABELS[stage]}</span>
                <Badge variant={STATUS_BADGE_VARIANT[row?.status ?? "pending"]} className="font-normal">
                  {TA_STAGE_STATUS_LABELS[row?.status ?? "pending"]}
                </Badge>
              </div>

              {completed ? (
                <div className="mt-1.5 space-y-1">
                  {row?.assigneeName ? (
                    <p className="text-muted-foreground text-xs">Reviewer: {row.assigneeName}</p>
                  ) : null}
                  {row?.notes ? <p className="text-sm whitespace-pre-wrap">{row.notes}</p> : null}
                  {stage === "client_interview" && row?.clientFeedback ? (
                    <div className="mt-1">
                      <p className="text-muted-foreground text-xs">Client assessment feedback</p>
                      <p className="text-sm whitespace-pre-wrap">{row.clientFeedback}</p>
                    </div>
                  ) : null}
                  {stage === "final_interview" && row?.proposedSalary ? (
                    <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Proposed salary</p>
                        <p className="text-sm">{row.proposedSalary}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Comm. allowance</p>
                        <p className="text-sm">{row.proposedCommunicationAllowance}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Transport allowance</p>
                        <p className="text-sm">{row.proposedTransportationAllowance}</p>
                      </div>
                    </div>
                  ) : null}
                  {row?.completedAt ? (
                    <p className="text-muted-foreground text-xs">{formatRelative(row.completedAt)}</p>
                  ) : null}
                </div>
              ) : stage === "l1_assessment" ? (
                canL1Assess ? (
                  <StageResultControls
                    pending={mutation.isPending}
                    onSubmit={(passed, notes) =>
                      mutation.mutate(() => completeL1Assessment({ applicationId, requestId, passed, notes }))
                    }
                  />
                ) : (
                  <p className="text-muted-foreground mt-1.5 text-xs">Only Talent Acquisition Staff can complete this.</p>
                )
              ) : stage === "l2_assessment" ? (
                !row?.assigneeId ? (
                  canAssignL2 ? (
                    <AssignL2Control
                      options={assigneeOptions.data ?? []}
                      pending={mutation.isPending}
                      onAssign={(assigneeId) =>
                        mutation.mutate(() => assignL2Assessment({ applicationId, requestId, assigneeId }))
                      }
                    />
                  ) : (
                    <p className="text-muted-foreground mt-1.5 text-xs">Waiting for a reviewer to be assigned.</p>
                  )
                ) : row.assigneeId === currentUserId || isAdmin ? (
                  <div className="mt-1.5 space-y-2">
                    <p className="text-muted-foreground text-xs">Reviewer: {row.assigneeName}</p>
                    <L2ResultControls
                      pending={mutation.isPending}
                      onSubmit={(passed, clientInterviewRequiredInput, notes) =>
                        mutation.mutate(() =>
                          completeL2Assessment({
                            applicationId,
                            requestId,
                            passed,
                            clientInterviewRequired: clientInterviewRequiredInput,
                            notes,
                          }),
                        )
                      }
                    />
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-1.5 text-xs">Assigned to {row.assigneeName}.</p>
                )
              ) : notStarted ? (
                <div className="mt-1.5 space-y-2">
                  <p className="text-muted-foreground text-xs">Not started yet.</p>
                  {canMove ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate(() => moveApplicationStage({ applicationId, requestId, stage }))}
                    >
                      Move here to start
                    </Button>
                  ) : null}
                </div>
              ) : stage === "client_interview" ? (
                !canL2Assess && !isAdmin ? (
                  <p className="text-muted-foreground mt-1.5 text-xs">Assigned to {row?.assigneeName ?? "the L2 reviewer"}.</p>
                ) : row?.assigneeId === currentUserId || isAdmin ? (
                  <div className="mt-1.5 space-y-2">
                    <p className="text-muted-foreground text-xs">Reviewer: {row?.assigneeName}</p>
                    <ClientInterviewResultControls
                      pending={mutation.isPending}
                      onSubmit={(passed, notes, clientFeedback) =>
                        mutation.mutate(() =>
                          completeClientInterview({ applicationId, requestId, passed, notes, clientFeedback }),
                        )
                      }
                    />
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-1.5 text-xs">Assigned to {row?.assigneeName}.</p>
                )
              ) : stage === "l3_assessment" ? (
                canL3Assess ? (
                  <StageResultControls
                    pending={mutation.isPending}
                    onSubmit={(passed, notes) =>
                      mutation.mutate(() => completeL3Assessment({ applicationId, requestId, passed, notes }))
                    }
                  />
                ) : (
                  <p className="text-muted-foreground mt-1.5 text-xs">Only Talent Acquisition Staff can complete this.</p>
                )
              ) : stage === "final_interview" ? (
                canFinalize ? (
                  <FinalInterviewResultControls
                    pending={mutation.isPending}
                    onSubmit={(passed, notes, money) =>
                      mutation.mutate(() =>
                        completeFinalInterview({ applicationId, requestId, passed, notes, ...money }),
                      )
                    }
                  />
                ) : (
                  <p className="text-muted-foreground mt-1.5 text-xs">Only Unit Manager tier can complete this.</p>
                )
              ) : null}

              {row ? (
                <ScorecardPanel
                  applicationStageId={row.id}
                  requestId={requestId}
                  stage={stage}
                  canScore={canScore}
                  currentUserId={currentUserId}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StageResultControls({
  pending,
  onSubmit,
  extra,
}: {
  pending: boolean;
  onSubmit: (passed: boolean, notes: string) => void;
  extra?: React.ReactNode;
}) {
  const [notes, setNotes] = React.useState("");

  return (
    <div className="mt-1.5 space-y-2">
      {extra}
      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        disabled={pending}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => onSubmit(false, notes)}>
          Mark failed
        </Button>
        <Button size="sm" disabled={pending} onClick={() => onSubmit(true, notes)}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Mark passed
        </Button>
      </div>
    </div>
  );
}

function L2ResultControls({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (passed: boolean, clientInterviewRequired: boolean, notes: string) => void;
}) {
  const [clientInterviewRequired, setClientInterviewRequired] = React.useState(false);

  return (
    <StageResultControls
      pending={pending}
      onSubmit={(passed, notes) => onSubmit(passed, clientInterviewRequired, notes)}
      extra={
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={clientInterviewRequired}
            onCheckedChange={(checked) => setClientInterviewRequired(checked === true)}
            disabled={pending}
          />
          Client Interview required
        </label>
      }
    />
  );
}

function ClientInterviewResultControls({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (passed: boolean, notes: string, clientFeedback: string) => void;
}) {
  const [clientFeedback, setClientFeedback] = React.useState("");

  return (
    <StageResultControls
      pending={pending}
      onSubmit={(passed, notes) => onSubmit(passed, notes, clientFeedback)}
      extra={
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Client assessment feedback</p>
          <Textarea
            value={clientFeedback}
            onChange={(event) => setClientFeedback(event.target.value)}
            placeholder="What the client said about this candidate"
            rows={2}
            disabled={pending}
          />
        </div>
      }
    />
  );
}

type FinalInterviewMoney = {
  proposedSalary: string;
  proposedCommunicationAllowance: string;
  proposedTransportationAllowance: string;
};

function FinalInterviewResultControls({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (passed: boolean, notes: string, money: FinalInterviewMoney) => void;
}) {
  const [proposedSalary, setProposedSalary] = React.useState("");
  const [proposedCommunicationAllowance, setProposedCommunicationAllowance] = React.useState("");
  const [proposedTransportationAllowance, setProposedTransportationAllowance] = React.useState("");
  const moneyComplete =
    proposedSalary.trim().length > 0 &&
    proposedCommunicationAllowance.trim().length > 0 &&
    proposedTransportationAllowance.trim().length > 0;

  return (
    <div className="mt-1.5 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Proposed salary</p>
          <Input
            value={proposedSalary}
            onChange={(event) => setProposedSalary(event.target.value)}
            inputMode="decimal"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Comm. allowance</p>
          <Input
            value={proposedCommunicationAllowance}
            onChange={(event) => setProposedCommunicationAllowance(event.target.value)}
            inputMode="decimal"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Transport allowance</p>
          <Input
            value={proposedTransportationAllowance}
            onChange={(event) => setProposedTransportationAllowance(event.target.value)}
            inputMode="decimal"
            disabled={pending}
          />
        </div>
      </div>
      <StageResultControlsInner
        pending={pending}
        disablePass={!moneyComplete}
        onSubmit={(passed, notes) =>
          onSubmit(passed, notes, { proposedSalary, proposedCommunicationAllowance, proposedTransportationAllowance })
        }
      />
    </div>
  );
}

/** Same Notes + Mark failed/passed footer as `StageResultControls`, but as a standalone (no wrapping `<div className="mt-1.5">`) since `FinalInterviewResultControls` already provides its own spacing and needs to disable "Mark passed" until the money fields are filled. */
function StageResultControlsInner({
  pending,
  disablePass,
  onSubmit,
}: {
  pending: boolean;
  disablePass?: boolean;
  onSubmit: (passed: boolean, notes: string) => void;
}) {
  const [notes, setNotes] = React.useState("");

  return (
    <div className="space-y-2">
      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        disabled={pending}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => onSubmit(false, notes)}>
          Mark failed
        </Button>
        <Button size="sm" disabled={pending || disablePass} onClick={() => onSubmit(true, notes)}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Mark passed
        </Button>
      </div>
    </div>
  );
}

function AssignL2Control({
  options,
  pending,
  onAssign,
}: {
  options: UserOption[];
  pending: boolean;
  onAssign: (assigneeId: string) => void;
}) {
  const [assigneeId, setAssigneeId] = React.useState("");

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <Select value={assigneeId} onValueChange={setAssigneeId} disabled={pending}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder="Assign a reviewer" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!assigneeId || pending} onClick={() => onAssign(assigneeId)}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Assign
      </Button>
    </div>
  );
}
