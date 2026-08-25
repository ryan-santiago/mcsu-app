"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, parseISO } from "date-fns";
import { Megaphone, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { AnnouncementDetailDialog } from "@/components/announcements/announcement-detail-dialog";
import { AnnouncementFormDialog, type AnnouncementFormValues } from "@/components/announcements/announcement-form-dialog";
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
import { RICH_TEXT_CONTENT_CLASSNAME } from "@/components/ui/rich-text-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { createAnnouncement, deleteAnnouncement, fetchAnnouncements, updateAnnouncement } from "@/server/announcements/actions";
import { announcementsQueryKey } from "@/server/announcements/query-key";
import {
  ANNOUNCEMENT_TYPE_LABELS,
  ANNOUNCEMENT_TYPES,
  type AnnouncementRow,
  type AnnouncementTypeFilter,
} from "@/server/announcements/types";

const FILTERS: AnnouncementTypeFilter[] = ["all", ...ANNOUNCEMENT_TYPES];

/** Below this many rows in the current tab, nothing is worth collapsing — there's nothing else competing for the space. */
const FEW_ANNOUNCEMENTS_THRESHOLD = 3;

function filterLabel(filter: AnnouncementTypeFilter): string {
  return filter === "all" ? "All" : ANNOUNCEMENT_TYPE_LABELS[filter];
}

type AnnouncementsViewProps = {
  canWrite: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function AnnouncementsView({ canWrite, canEdit, canDelete }: AnnouncementsViewProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<AnnouncementTypeFilter>("all");
  const [formTarget, setFormTarget] = React.useState<AnnouncementRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<AnnouncementRow | null>(null);
  const [viewing, setViewing] = React.useState<AnnouncementRow | null>(null);

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<AnnouncementRow[]>({
    queryKey: announcementsQueryKey(),
    queryFn: fetchAnnouncements,
    placeholderData: (previous) => previous,
  });

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: announcementsQueryKey() });
        setFormTarget(null);
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const announcements = data ?? [];
  const filtered = filter === "all" ? announcements : announcements.filter((row) => row.type === filter);
  const canManage = canEdit || canDelete;

  function handleSubmit(values: AnnouncementFormValues) {
    if (formTarget === "new") {
      mutation.mutate(() => createAnnouncement(values));
    } else if (formTarget) {
      mutation.mutate(() => updateAnnouncement({ id: formTarget.id, ...values }));
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={(value) => setFilter(value as AnnouncementTypeFilter)} className="gap-6">
        <div className="flex items-center justify-between gap-3 border-b">
          <TabsList variant="line">
            {FILTERS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {filterLabel(value)}
              </TabsTrigger>
            ))}
          </TabsList>

          {canWrite ? (
            <Button size="sm" className="mb-2 shrink-0" onClick={() => setFormTarget("new")}>
              <Plus className="size-4" aria-hidden />
              Create
            </Button>
          ) : null}
        </div>

        {FILTERS.map((value) => (
          <TabsContent key={value} value={value}>
            {isPending ? (
              <div className="space-y-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex gap-4 border-l-2 pl-4">
                    <Skeleton className="h-4 w-16" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3.5 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="No announcements yet"
                description={
                  canWrite
                    ? "Post the first announcement to keep everyone in the loop."
                    : "Check back later for news and updates."
                }
                action={
                  canWrite ? (
                    <Button size="sm" onClick={() => setFormTarget("new")}>
                      <Plus className="size-4" aria-hidden />
                      Create
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ol className={cn("divide-y", isFetching && "opacity-70")}>
                {filtered.map((row, index) => (
                  <AnnouncementListItem
                    key={row.id}
                    row={row}
                    // Few enough rows that nothing is competing for space, or this is the
                    // newest one in the current tab — both cases skip clamping entirely.
                    expanded={filtered.length <= FEW_ANNOUNCEMENTS_THRESHOLD || index === 0}
                    canManage={canManage}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    disabled={mutation.isPending}
                    onEdit={() => setFormTarget(row)}
                    onDelete={() => setDeleting(row)}
                    onReadMore={() => setViewing(row)}
                  />
                ))}
              </ol>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : "Could not load announcements."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <AnnouncementFormDialog
        target={formTarget}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setFormTarget(null)}
        onSubmit={handleSubmit}
      />

      <AnnouncementDetailDialog announcement={viewing} onOpenChange={(open) => !open && setViewing(null)} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{deleting.title}</span> will be permanently removed
                  for everyone.
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
                mutation.mutate(() => deleteAnnouncement({ id: deleting.id }));
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

/** Whether the ref'd element's content is currently being clipped by a line-clamp — re-measured on resize, since reflow can change how many lines fit. */
function useIsClamped<T extends HTMLElement>(deps: unknown[]) {
  const ref = React.useRef<T>(null);
  const [isClamped, setIsClamped] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) {
      setIsClamped(false);
      return;
    }

    function measure() {
      if (element) setIsClamped(element.scrollHeight - element.clientHeight > 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, isClamped };
}

function AnnouncementListItem({
  row,
  expanded,
  canManage,
  canEdit,
  canDelete,
  disabled,
  onEdit,
  onDelete,
  onReadMore,
}: {
  row: AnnouncementRow;
  /** Skips the line-clamp entirely — the newest row in the tab, or too few rows to bother collapsing. */
  expanded: boolean;
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReadMore: () => void;
}) {
  const date = parseISO(row.announcementDate);
  const today = isToday(date);
  const { ref, isClamped } = useIsClamped<HTMLDivElement>([row.description, expanded]);
  const showReadMore = !expanded && isClamped;

  return (
    <li className="flex gap-4 py-5 first:pt-0">
      <div className="text-muted-foreground w-16 shrink-0 text-xs leading-tight">
        {today ? (
          "Today"
        ) : (
          <>
            {format(date, "MMM d")}
            <br />
            {format(date, "yyyy")}
          </>
        )}
      </div>

      <div className="border-border min-w-0 flex-1 border-l-2 pl-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{row.title}</h3>
              <Badge variant="secondary" className="shrink-0 font-normal">
                {ANNOUNCEMENT_TYPE_LABELS[row.type]}
              </Badge>
            </div>
            {row.description ? (
              <div
                ref={expanded ? undefined : ref}
                className={cn(
                  RICH_TEXT_CONTENT_CLASSNAME,
                  "text-muted-foreground mt-1.5",
                  !expanded && "line-clamp-4",
                )}
                dangerouslySetInnerHTML={{ __html: row.description }}
              />
            ) : null}
            {showReadMore ? (
              <button
                type="button"
                onClick={onReadMore}
                className="text-brand mt-1 text-xs font-medium hover:underline"
              >
                Read more
              </button>
            ) : null}
          </div>

          {canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  aria-label={`Actions for ${row.title}`}
                  className="shrink-0"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit ? (
                  <DropdownMenuItem onSelect={onEdit}>
                    <Pencil className="size-4" aria-hidden />
                    Edit
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2 className="size-4" aria-hidden />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </li>
  );
}
