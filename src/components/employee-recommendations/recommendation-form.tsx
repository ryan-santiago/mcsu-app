"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileCheck2, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { formatSalary } from "@/lib/employee-format";
import { erfFileName, generateEmployeeRecommendationErfPdf } from "@/lib/employee-recommendation-pdf";
import {
  requestedActionsSchema,
  type RequestedActions,
} from "@/lib/validation/employee-recommendations";
import { fetchLookupOptions } from "@/server/employees/actions";
import {
  applyRecommendation,
  approveRecommendationStep,
  cancelRecommendation,
  fetchEmployeeRecommendationSnapshot,
  fetchRecommendationById,
  rejectRecommendationStep,
  removeKpiResult,
  saveGeneratedErf,
  submitRecommendation,
  updateRecommendationDraft,
  uploadKpiResult,
} from "@/server/employee-recommendations/actions";
import {
  pendingApprovalsQueryKey,
  recommendationByIdQueryKey,
  recommendationQueueQueryKey,
  recommendationSnapshotQueryKey,
  recommendationsInProgressQueryKey,
} from "@/server/employee-recommendations/query-key";
import type { EmployeeRecommendationSnapshot, RecommendationDetail } from "@/server/employee-recommendations/types";

import { ApprovalTimeline } from "./approval-timeline";
import { RecommendationStatusBadge } from "./recommendation-badges";

const TRIGGER_LABELS: Record<RecommendationDetail["triggerType"], string> = {
  ph_contract_expiring: "Project Hired contract expiring",
  probationary_expiring: "Probationary period expiring",
  manual_regular: "Regular employee — annual KPI",
};

export function RecommendationForm({ id }: { id: string }) {
  const { data: recommendation, isPending } = useQuery({
    queryKey: recommendationByIdQueryKey(id),
    queryFn: () => fetchRecommendationById(id),
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!recommendation) {
    return (
      <EmptyState
        icon={UploadCloud}
        title="Recommendation not found"
        description="It may have been cancelled, or you may not have access to it."
      />
    );
  }

  return <RecommendationFormBody recommendation={recommendation} />;
}

function RecommendationFormBody({ recommendation }: { recommendation: RecommendationDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const snapshotQuery = useQuery({
    queryKey: recommendationSnapshotQueryKey(recommendation.employeeId),
    queryFn: () => fetchEmployeeRecommendationSnapshot(recommendation.employeeId),
  });

  const [accomplishments, setAccomplishments] = React.useState(
    recommendation.accomplishmentsAndRecommendation ?? "",
  );
  const [actions, setActions] = React.useState<RequestedActions>(recommendation.requestedActions);
  const [cancelling, setCancelling] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [reviewing, setReviewing] = React.useState<"approve" | "reject" | null>(null);
  const [reviewNote, setReviewNote] = React.useState("");
  const [applying, setApplying] = React.useState(false);
  const [effectiveDate, setEffectiveDate] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const readOnly = !recommendation.canEdit;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: recommendationByIdQueryKey(recommendation.id) });
    void queryClient.invalidateQueries({ queryKey: recommendationQueueQueryKey() });
    void queryClient.invalidateQueries({ queryKey: recommendationsInProgressQueryKey() });
    void queryClient.invalidateQueries({ queryKey: pendingApprovalsQueryKey() });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const parsed = requestedActionsSchema.safeParse(actions);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Check the sections you've checked for missing fields.");
      }
      return updateRecommendationDraft({
        id: recommendation.id,
        accomplishmentsAndRecommendation: accomplishments,
        requestedActions: parsed.data,
      });
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Something went wrong."),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelRecommendation({ id: recommendation.id }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setCancelling(false);
        invalidate();
        router.push("/employee-recommendations");
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const kpiUploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.set("recommendationId", recommendation.id);
      formData.set("file", file);
      return uploadKpiResult(formData);
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const kpiRemoveMutation = useMutation({
    mutationFn: () => removeKpiResult({ id: recommendation.id }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitRecommendation({ id: recommendation.id }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setSubmitting(false);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const reviewMutation = useMutation({
    mutationFn: () => {
      if (!recommendation.approval) throw new Error("No approval in progress.");
      const input = { approvalRequestId: recommendation.approval.approvalRequestId, note: reviewNote };
      return reviewing === "approve" ? approveRecommendationStep(input) : rejectRecommendationStep(input);
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setReviewing(null);
        setReviewNote("");
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const generateErfMutation = useMutation({
    mutationFn: async () => {
      const blob = await generateEmployeeRecommendationErfPdf(recommendation);
      const fileName = erfFileName(recommendation.employeeName);

      // Trigger the user's own download immediately — independent of whether the server upload below succeeds.
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      const formData = new FormData();
      formData.set("recommendationId", recommendation.id);
      formData.set("file", blob, fileName);
      return saveGeneratedErf(formData);
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not generate the ERF."),
  });

  const applyMutation = useMutation({
    mutationFn: () => applyRecommendation({ id: recommendation.id, effectiveDate }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setApplying(false);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const pending =
    saveMutation.isPending ||
    cancelMutation.isPending ||
    kpiUploadMutation.isPending ||
    kpiRemoveMutation.isPending ||
    submitMutation.isPending ||
    generateErfMutation.isPending ||
    applyMutation.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>General Information</CardTitle>
            <RecommendationStatusBadge status={recommendation.status} />
          </div>
          <CardDescription>{TRIGGER_LABELS[recommendation.triggerType]}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <ReadOnlyField label="Submitted by" value={recommendation.submittedByName} />
          <ReadOnlyField label="Date filed" value={formatDateTime(recommendation.createdAt)} />
          <ReadOnlyField label="Employee name" value={recommendation.employeeName} />
          <ReadOnlyField label="Employee number" value={recommendation.employeeNumberSnapshot ?? "—"} />
          <ReadOnlyField label="Department" value={recommendation.departmentSnapshot} />
          <ReadOnlyField label="Position" value={recommendation.positionSnapshot} />
          <ReadOnlyField label="Manager" value={recommendation.managerNameSnapshot} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions Requested</CardTitle>
          <CardDescription>Check only the sections that apply.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {snapshotQuery.isPending ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : (
            <ActionsRequestedSections
              actions={actions}
              onChange={setActions}
              snapshot={snapshotQuery.data ?? null}
              disabled={readOnly || pending}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accomplishments, Contributions &amp; Final Recommendation</CardTitle>
        </CardHeader>
        <CardContent>
          <RichTextEditor
            value={accomplishments}
            onChange={setAccomplishments}
            placeholder="Summarize the employee's accomplishments, contributions, and your final recommendation…"
            disabled={readOnly || pending}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>KPI Result</CardTitle>
          <CardDescription>Upload the KPI Result as a PDF.</CardDescription>
        </CardHeader>
        <CardContent>
          {recommendation.hasKpiResult ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <a
                href={`/api/employee-recommendations/${recommendation.id}/kpi-result`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand text-sm font-medium underline underline-offset-2"
              >
                View KPI Result PDF
              </a>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => kpiRemoveMutation.mutate()}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Remove
                </Button>
              ) : null}
            </div>
          ) : readOnly ? (
            <p className="text-muted-foreground text-sm">No KPI Result attached.</p>
          ) : (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) kpiUploadMutation.mutate(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => fileInputRef.current?.click()}
              >
                {kpiUploadMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <UploadCloud className="size-4" aria-hidden />
                )}
                Upload KPI Result (PDF)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {recommendation.approval ? (
        <Card>
          <CardHeader>
            <CardTitle>Approval</CardTitle>
            <CardDescription>
              {recommendation.approval.status === "pending"
                ? "Waiting on the steps below, in order."
                : recommendation.approval.status === "approved"
                  ? "Fully approved."
                  : "Rejected."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ApprovalTimeline approval={recommendation.approval} />

            {recommendation.actionableStepId ? (
              <div className="flex items-center gap-2 border-t pt-4">
                <Button size="sm" disabled={pending} onClick={() => setReviewing("approve")}>
                  Review &amp; approve
                </Button>
                <Button size="sm" variant="destructive" disabled={pending} onClick={() => setReviewing("reject")}>
                  Reject
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {recommendation.canGenerateErf || recommendation.hasErf ? (
        <Card>
          <CardHeader>
            <CardTitle>ERF</CardTitle>
            <CardDescription>
              {recommendation.hasErf
                ? "Send this, along with the KPI Result, to HRD."
                : "Generates the filled-out form as a PDF for HRD."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recommendation.hasErf ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <a
                  href={`/api/employee-recommendations/${recommendation.id}/erf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand text-sm font-medium underline underline-offset-2"
                >
                  View ERF PDF
                </a>
                {recommendation.erfGeneratedAt ? (
                  <span className="text-muted-foreground text-xs">
                    Generated {formatDateTime(recommendation.erfGeneratedAt)}
                  </span>
                ) : null}
              </div>
            ) : (
              <Button disabled={pending} onClick={() => generateErfMutation.mutate()}>
                {generateErfMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileCheck2 className="size-4" aria-hidden />
                )}
                Generate ERF
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      {recommendation.canApply || recommendation.status === "applied" ? (
        <Card>
          <CardHeader>
            <CardTitle>Employment History</CardTitle>
            <CardDescription>
              {recommendation.status === "applied"
                ? "A new employment record now reflects this recommendation."
                : "Creates the new employment record once you know the effective date HRD's process results in."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recommendation.status === "applied" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <a
                  href={`/employees/${recommendation.employeeId}`}
                  className="text-brand text-sm font-medium underline underline-offset-2"
                >
                  View employee record
                </a>
                {recommendation.appliedToEmploymentHistoryAt ? (
                  <span className="text-muted-foreground text-xs">
                    Applied {formatDateTime(recommendation.appliedToEmploymentHistoryAt)}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <ApplyChangesSummary actions={recommendation.requestedActions} />
                <Button
                  disabled={pending}
                  onClick={() => {
                    setEffectiveDate(format(new Date(), "yyyy-MM-dd"));
                    setApplying(true);
                  }}
                >
                  Apply to Employment History
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!readOnly ? (
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={pending} onClick={() => setCancelling(true)}>
            Cancel this draft
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={pending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save draft
            </Button>
            {recommendation.canSubmit ? (
              <Button disabled={pending} onClick={() => setSubmitting(true)}>
                Submit for approval
              </Button>
            ) : null}
          </div>
        </div>
      ) : recommendation.status === "submitted" && recommendation.canCancel ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={() => setCancelling(true)}>
            Withdraw recommendation
          </Button>
        </div>
      ) : null}

      <AlertDialog open={submitting} onOpenChange={setSubmitting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit for approval?</AlertDialogTitle>
            <AlertDialogDescription>
              This saves the current draft and routes it to the Unit Manager, then the Department Head. You
              won&apos;t be able to edit it while it&apos;s pending review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitMutation.isPending}>Not yet</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                saveMutation.mutate(undefined, { onSuccess: (result) => result.ok && submitMutation.mutate() });
              }}
            >
              {submitMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(reviewing)} onOpenChange={(open) => !open && setReviewing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reviewing === "approve" ? "Approve" : "Reject"} {recommendation.employeeName}&apos;s recommendation?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {reviewing === "reject"
                ? "This ends the approval process — the manager will need to submit a new recommendation if this is reconsidered."
                : "This moves the recommendation to the next approver, or finalizes it if this is the last step."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="review-note">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="review-note"
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              disabled={reviewMutation.isPending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reviewMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={reviewing === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              disabled={reviewMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                reviewMutation.mutate();
              }}
            >
              {reviewMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {reviewing === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelling} onOpenChange={setCancelling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {recommendation.status === "draft" ? "Cancel this draft?" : "Withdraw this recommendation?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {recommendation.status === "draft"
                ? `${recommendation.employeeName}'s employment record will fall back into the monitoring queue if it's still within the renewal window.`
                : `This withdraws the pending approval request — the approvers waiting on it will no longer be able to act on it. ${recommendation.employeeName}'s employment record will fall back into the monitoring queue if it's still within the renewal window.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              {recommendation.status === "draft" ? "Keep draft" : "Keep recommendation"}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                cancelMutation.mutate();
              }}
            >
              {recommendation.status === "draft" ? "Cancel draft" : "Withdraw"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={applying} onOpenChange={setApplying}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply to employment history?</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a new employment record for {recommendation.employeeName} starting on the date below, and
              closes out their current one. This can&apos;t be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Effective date</Label>
            <DatePicker value={effectiveDate} onChange={setEffectiveDate} disabled={applyMutation.isPending} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={applyMutation.isPending || !effectiveDate}
              onClick={(event) => {
                event.preventDefault();
                applyMutation.mutate();
              }}
            >
              {applyMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** From/To summary for the sections that actually change employment history — Department/Division are record-only notes and never applied here, so they're deliberately excluded. */
function ApplyChangesSummary({ actions }: { actions: RequestedActions }) {
  const rows: { label: string; from: string; to: string }[] = [];

  if (actions.supervisorChange) {
    rows.push({ label: "Supervisor", from: actions.supervisorChange.fromTeamName, to: actions.supervisorChange.toTeamName });
  }
  if (actions.jobTitleChange) {
    rows.push({ label: "Job title", from: actions.jobTitleChange.fromLabel, to: actions.jobTitleChange.toLabel });
  }
  if (actions.salaryChange) {
    rows.push({
      label: "Salary",
      from: formatSalary(actions.salaryChange.fromSalary),
      to: formatSalary(actions.salaryChange.toSalary),
    });
    rows.push({
      label: "Communication allowance",
      from: formatSalary(actions.salaryChange.fromCommunicationAllowance),
      to: formatSalary(actions.salaryChange.toCommunicationAllowance),
    });
    rows.push({
      label: "Transportation allowance",
      from: formatSalary(actions.salaryChange.fromTransportationAllowance),
      to: formatSalary(actions.salaryChange.toTransportationAllowance),
    });
  }
  if (actions.categoryChange) {
    rows.push({
      label: "Category",
      from: actions.categoryChange.fromEmploymentTypeName,
      to: actions.categoryChange.toEmploymentTypeName,
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing here changes an employment record — applying just marks this recommendation as complete.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="font-medium">
            {row.from} <span className="text-muted-foreground">&rarr;</span> {row.to}
          </span>
        </div>
      ))}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

type ActionsRequestedSectionsProps = {
  actions: RequestedActions;
  onChange: (actions: RequestedActions) => void;
  snapshot: EmployeeRecommendationSnapshot | null;
  disabled: boolean;
};

function ActionsRequestedSections({ actions, onChange, snapshot, disabled }: ActionsRequestedSectionsProps) {
  const teamOptions = useQuery({ queryKey: ["employee-lookup-options", "team"], queryFn: () => fetchLookupOptions("team") });
  const levelOptions = useQuery({ queryKey: ["employee-lookup-options", "level"], queryFn: () => fetchLookupOptions("level") });
  const positionOptions = useQuery({
    queryKey: ["employee-lookup-options", "position"],
    queryFn: () => fetchLookupOptions("position"),
  });
  const employmentTypeOptions = useQuery({
    queryKey: ["employee-lookup-options", "employment_type"],
    queryFn: () => fetchLookupOptions("employment_type"),
  });

  function set<K extends keyof RequestedActions>(key: K, value: RequestedActions[K]) {
    onChange({ ...actions, [key]: value });
  }

  return (
    <div className="space-y-3">
      <Section
        title="Supervisor Change"
        checked={Boolean(actions.supervisorChange)}
        disabled={disabled}
        onToggle={(checked) =>
          set(
            "supervisorChange",
            checked
              ? { fromTeamId: snapshot?.teamId ?? null, fromTeamName: snapshot?.teamName ?? "—", toTeamId: "", toTeamName: "" }
              : undefined,
          )
        }
      >
        {actions.supervisorChange ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label="From" value={actions.supervisorChange.fromTeamName} />
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Select
                value={actions.supervisorChange.toTeamId}
                onValueChange={(value) => {
                  const name = teamOptions.data?.find((o) => o.id === value)?.name ?? "";
                  set("supervisorChange", { ...actions.supervisorChange!, toTeamId: value, toTeamName: name });
                }}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teamOptions.data?.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Department Change"
        checked={Boolean(actions.departmentChange)}
        disabled={disabled}
        onToggle={(checked) => set("departmentChange", checked ? { from: "QSERV-MCSU", to: "" } : undefined)}
      >
        {actions.departmentChange ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="From"
              value={actions.departmentChange.from}
              disabled={disabled}
              onChange={(value) => set("departmentChange", { ...actions.departmentChange!, from: value })}
            />
            <TextField
              label="To"
              value={actions.departmentChange.to}
              disabled={disabled}
              onChange={(value) => set("departmentChange", { ...actions.departmentChange!, to: value })}
            />
          </div>
        ) : null}
      </Section>

      <Section
        title="Job Title Change"
        checked={Boolean(actions.jobTitleChange)}
        disabled={disabled}
        onToggle={(checked) =>
          set(
            "jobTitleChange",
            checked
              ? {
                  fromLevelId: snapshot?.levelId ?? null,
                  fromPositionId: snapshot?.positionId ?? null,
                  fromLabel: snapshot?.levelPositionLabel ?? "—",
                  toLevelId: "",
                  toPositionId: "",
                  toLabel: "",
                }
              : undefined,
          )
        }
      >
        {actions.jobTitleChange ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <ReadOnlyField label="From" value={actions.jobTitleChange.fromLabel} />
            <div className="space-y-1">
              <Label className="text-xs">New level</Label>
              <Select
                value={actions.jobTitleChange.toLevelId}
                onValueChange={(value) => {
                  const levelName = levelOptions.data?.find((o) => o.id === value)?.name ?? "";
                  const positionName = positionOptions.data?.find((o) => o.id === actions.jobTitleChange!.toPositionId)?.name ?? "";
                  set("jobTitleChange", {
                    ...actions.jobTitleChange!,
                    toLevelId: value,
                    toLabel: positionName ? `${levelName} - ${positionName}` : levelName,
                  });
                }}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {levelOptions.data?.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">New position</Label>
              <Select
                value={actions.jobTitleChange.toPositionId}
                onValueChange={(value) => {
                  const positionName = positionOptions.data?.find((o) => o.id === value)?.name ?? "";
                  const levelName = levelOptions.data?.find((o) => o.id === actions.jobTitleChange!.toLevelId)?.name ?? "";
                  set("jobTitleChange", {
                    ...actions.jobTitleChange!,
                    toPositionId: value,
                    toLabel: levelName ? `${levelName} - ${positionName}` : positionName,
                  });
                }}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  {positionOptions.data?.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Division Change"
        checked={Boolean(actions.divisionChange)}
        disabled={disabled}
        onToggle={(checked) => set("divisionChange", checked ? { from: "", to: "" } : undefined)}
      >
        {actions.divisionChange ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="From"
              value={actions.divisionChange.from}
              disabled={disabled}
              onChange={(value) => set("divisionChange", { ...actions.divisionChange!, from: value })}
            />
            <TextField
              label="To"
              value={actions.divisionChange.to}
              disabled={disabled}
              onChange={(value) => set("divisionChange", { ...actions.divisionChange!, to: value })}
            />
          </div>
        ) : null}
      </Section>

      <Section
        title="Salary Change"
        checked={Boolean(actions.salaryChange)}
        disabled={disabled}
        onToggle={(checked) =>
          set(
            "salaryChange",
            checked
              ? {
                  fromSalary: snapshot?.salary ?? "0",
                  fromCommunicationAllowance: snapshot?.communicationAllowance ?? "0",
                  fromTransportationAllowance: snapshot?.transportationAllowance ?? "0",
                  toSalary: "",
                  toCommunicationAllowance: "",
                  toTransportationAllowance: "",
                }
              : undefined,
          )
        }
      >
        {actions.salaryChange ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <ReadOnlyField label="From salary" value={formatSalary(actions.salaryChange.fromSalary)} />
            <ReadOnlyField
              label="From communication allowance"
              value={formatSalary(actions.salaryChange.fromCommunicationAllowance)}
            />
            <ReadOnlyField
              label="From transportation allowance"
              value={formatSalary(actions.salaryChange.fromTransportationAllowance)}
            />
            <MoneyField
              label="New salary"
              value={actions.salaryChange.toSalary}
              disabled={disabled}
              onChange={(value) => set("salaryChange", { ...actions.salaryChange!, toSalary: value })}
            />
            <MoneyField
              label="New communication allowance"
              value={actions.salaryChange.toCommunicationAllowance}
              disabled={disabled}
              onChange={(value) => set("salaryChange", { ...actions.salaryChange!, toCommunicationAllowance: value })}
            />
            <MoneyField
              label="New transportation allowance"
              value={actions.salaryChange.toTransportationAllowance}
              disabled={disabled}
              onChange={(value) => set("salaryChange", { ...actions.salaryChange!, toTransportationAllowance: value })}
            />
          </div>
        ) : null}
      </Section>

      <Section
        title="Category Change"
        checked={Boolean(actions.categoryChange)}
        disabled={disabled}
        onToggle={(checked) =>
          set(
            "categoryChange",
            checked
              ? {
                  fromEmploymentTypeId: snapshot?.employmentTypeId ?? null,
                  fromEmploymentTypeName: snapshot?.employmentTypeName ?? "—",
                  toEmploymentTypeId: "",
                  toEmploymentTypeName: "",
                  toLabel: "",
                }
              : undefined,
          )
        }
      >
        {actions.categoryChange ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <ReadOnlyField label="From" value={actions.categoryChange.fromEmploymentTypeName} />
            <div className="space-y-1">
              <Label className="text-xs">New category</Label>
              <Select
                value={actions.categoryChange.toEmploymentTypeId}
                onValueChange={(value) => {
                  const name = employmentTypeOptions.data?.find((o) => o.id === value)?.name ?? "";
                  set("categoryChange", { ...actions.categoryChange!, toEmploymentTypeId: value, toEmploymentTypeName: name });
                }}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {employmentTypeOptions.data?.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TextField
              label="Extension / note"
              placeholder="e.g. 6 Months Extension"
              value={actions.categoryChange.toLabel ?? ""}
              disabled={disabled}
              onChange={(value) => set("categoryChange", { ...actions.categoryChange!, toLabel: value })}
            />
          </div>
        ) : null}
      </Section>
    </div>
  );
}

function Section({
  title,
  checked,
  disabled,
  onToggle,
  children,
}: {
  title: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  const inputId = `section-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Checkbox id={inputId} checked={checked} onCheckedChange={(value) => onToggle(value === true)} disabled={disabled} />
        <Label htmlFor={inputId} className="font-medium">
          {title}
        </Label>
      </div>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function MoneyField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label} (₱)</Label>
      <Input type="number" step="0.01" min="0" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

