"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Paperclip, Pencil, RotateCcw, Trash2, Upload, UserCheck, UserRoundX, UserX } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { CandidateComments } from "@/components/talent-acquisition/candidate-comments";
import { StageChecklist } from "@/components/talent-acquisition/stage-checklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActionResult } from "@/lib/action-result";
import { formatBytes } from "@/lib/format";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { fetchTaApplication, setTaApplicationStatus } from "@/server/talent-acquisition/application-actions";
import { taApplicationQueryKey, taApplicationsQueryKey } from "@/server/talent-acquisition/application-query-key";
import { TA_APPLICATION_STATUS_LABELS, type TaApplicationRow } from "@/server/talent-acquisition/application-types";
import { uploadTaCandidateCv } from "@/server/talent-acquisition/candidate-actions";

const STATUS_BADGE_VARIANT: Record<TaApplicationRow["status"], "default" | "secondary" | "outline"> = {
  active: "default",
  hired: "secondary",
  rejected: "outline",
  withdrawn: "outline",
};

type ApplicationDetailSheetProps = {
  applicationId: string | null;
  requestId: string;
  canWrite: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canL1Assess: boolean;
  canL2Assess: boolean;
  canL3Assess: boolean;
  canFinalize: boolean;
  canMigrate: boolean;
  currentUserId: string;
  hasOverrideAccess: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (application: TaApplicationRow) => void;
  onDelete: (application: TaApplicationRow) => void;
};

export function ApplicationDetailSheet({
  applicationId,
  requestId,
  canWrite,
  canEdit,
  canDelete,
  canL1Assess,
  canL2Assess,
  canL3Assess,
  canFinalize,
  canMigrate,
  currentUserId,
  hasOverrideAccess,
  onOpenChange,
  onEdit,
  onDelete,
}: ApplicationDetailSheetProps) {
  return (
    <Sheet open={Boolean(applicationId)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {applicationId ? (
          <ApplicationDetailContent
            key={applicationId}
            applicationId={applicationId}
            requestId={requestId}
            canWrite={canWrite}
            canEdit={canEdit}
            canDelete={canDelete}
            canL1Assess={canL1Assess}
            canL2Assess={canL2Assess}
            canL3Assess={canL3Assess}
            canFinalize={canFinalize}
            canMigrate={canMigrate}
            currentUserId={currentUserId}
            hasOverrideAccess={hasOverrideAccess}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ApplicationDetailContent({
  applicationId,
  requestId,
  canWrite,
  canEdit,
  canDelete,
  canL1Assess,
  canL2Assess,
  canL3Assess,
  canFinalize,
  canMigrate,
  currentUserId,
  hasOverrideAccess,
  onEdit,
  onDelete,
}: Omit<ApplicationDetailSheetProps, "applicationId" | "onOpenChange"> & { applicationId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: application, isLoading } = useQuery({
    queryKey: taApplicationQueryKey(applicationId),
    queryFn: () => fetchTaApplication(applicationId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: taApplicationQueryKey(applicationId) });
    void queryClient.invalidateQueries({ queryKey: taApplicationsQueryKey(requestId) });
  };

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
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

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("candidateId", application!.candidateId);
      formData.append("requestId", requestId);
      formData.append("file", file);
      return uploadTaCandidateCv(formData);
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

  if (isLoading || !application) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  const fullName = formatEmployeeDisplayName(application);
  const canManage = canEdit || canDelete || canMigrate;
  const isBusy = mutation.isPending || uploadMutation.isPending;

  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <SheetTitle>{fullName}</SheetTitle>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge variant={STATUS_BADGE_VARIANT[application.status]} className="font-normal">
                {TA_APPLICATION_STATUS_LABELS[application.status]}
              </Badge>
              {application.genderName ? <span className="text-muted-foreground text-xs">{application.genderName}</span> : null}
            </div>
          </div>

          {canManage ? (
            <>
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
                    {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MoreHorizontal className="size-4" aria-hidden />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit ? (
                    <DropdownMenuItem onSelect={() => onEdit(application)}>
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </DropdownMenuItem>
                  ) : null}
                  {canEdit ? (
                    <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                      <Upload className="size-4" aria-hidden />
                      {application.cvFileName ? "Replace CV" : "Upload CV"}
                    </DropdownMenuItem>
                  ) : null}
                  {canMigrate && application.status === "active" && !application.employeeId ? (
                    <DropdownMenuItem asChild>
                      <Link href={`/talent-acquisition/${requestId}/applications/${application.id}/migrate`}>
                        <UserCheck className="size-4" aria-hidden />
                        Migrate to Employee
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {canEdit && application.status !== "hired" ? (
                    application.status === "active" ? (
                      <>
                        <DropdownMenuItem
                          onSelect={() => mutation.mutate(() => setTaApplicationStatus({ id: application.id, requestId, status: "rejected" }))}
                        >
                          <UserX className="size-4" aria-hidden />
                          Mark rejected
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => mutation.mutate(() => setTaApplicationStatus({ id: application.id, requestId, status: "withdrawn" }))}
                        >
                          <UserRoundX className="size-4" aria-hidden />
                          Mark withdrawn
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem
                        onSelect={() => mutation.mutate(() => setTaApplicationStatus({ id: application.id, requestId, status: "active" }))}
                      >
                        <RotateCcw className="size-4" aria-hidden />
                        Reactivate
                      </DropdownMenuItem>
                    )
                  ) : null}
                  {canDelete ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(application)}>
                      <Trash2 className="size-4" aria-hidden />
                      Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </div>
      </SheetHeader>

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Contact</p>
            <p className="mt-0.5">{application.mobileNumber || "—"}</p>
            <p className="text-muted-foreground text-xs">{application.personalEmail || ""}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Source</p>
            <p className="mt-0.5">{application.sourceName ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">CV</p>
            {application.cvFileName ? (
              <a
                href={`/api/talent-acquisition/candidates/${application.candidateId}/cv`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand mt-0.5 inline-flex items-center gap-1 text-sm hover:underline"
              >
                <Paperclip className="size-3.5 shrink-0" aria-hidden />
                <span className="max-w-40 truncate">{application.cvFileName}</span>
                <span className="text-muted-foreground shrink-0">({formatBytes(application.cvSize)})</span>
              </a>
            ) : (
              <p className="text-muted-foreground mt-0.5">—</p>
            )}
          </div>
        </div>

        <Separator />

        <StageChecklist
          applicationId={application.id}
          requestId={requestId}
          clientInterviewRequired={application.clientInterviewRequired}
          currentUserId={currentUserId}
          isAdmin={hasOverrideAccess}
          canL1Assess={canL1Assess}
          canAssignL2={canEdit}
          canL2Assess={canL2Assess}
          canL3Assess={canL3Assess}
          canFinalize={canFinalize}
          canMove={canEdit}
        />

        <Separator />

        <CandidateComments requestId={requestId} candidateId={application.candidateId} canComment={canWrite} />
      </div>
    </>
  );
}
