"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaStage } from "@/db/schema";
import { fetchTaScorecards, submitTaScorecard } from "@/server/talent-acquisition/scorecard-actions";
import { taScorecardsQueryKey } from "@/server/talent-acquisition/scorecard-query-key";
import { TA_SCORECARD_RATING_LABELS, TA_SCORECARD_RATING_VALUES, type TaScorecardRow } from "@/server/talent-acquisition/scorecard-types";

const RATING_BADGE_CLASS: Record<TaScorecardRow["rating"], string> = {
  strong_yes: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  yes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  no: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  strong_no: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

type ScorecardPanelProps = {
  applicationStageId: string;
  requestId: string;
  stage: TaStage;
  canScore: boolean;
  currentUserId: string;
};

export function ScorecardPanel({ applicationStageId, requestId, stage, canScore, currentUserId }: ScorecardPanelProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: taScorecardsQueryKey(applicationStageId),
    queryFn: () => fetchTaScorecards(applicationStageId),
  });

  const scorecards = data ?? [];
  const mine = scorecards.find((scorecard) => scorecard.evaluatorId === currentUserId);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: taScorecardsQueryKey(applicationStageId) });
        setEditing(false);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  if (scorecards.length === 0 && !canScore) return null;

  const summary = TA_SCORECARD_RATING_VALUES.map((rating) => ({
    rating,
    count: scorecards.filter((scorecard) => scorecard.rating === rating).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div className="mt-2 border-t pt-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} aria-hidden />
        Scorecards
        {summary.length > 0 ? (
          <span className="flex gap-1">
            {summary.map((entry) => (
              <span key={entry.rating} className={cn("rounded px-1.5 py-0.5 text-xs", RATING_BADGE_CLASS[entry.rating])}>
                {entry.count} {TA_SCORECARD_RATING_LABELS[entry.rating]}
              </span>
            ))}
          </span>
        ) : (
          <span>(none yet)</span>
        )}
      </button>

      {expanded ? (
        <ul className="mt-2 space-y-1.5">
          {scorecards.length === 0 ? (
            <li className="text-muted-foreground text-xs">No scorecards yet.</li>
          ) : (
            scorecards.map((scorecard) => (
              <li key={scorecard.id} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{scorecard.evaluatorName ?? "Unknown"}</span>
                  <span className={cn("rounded px-1.5 py-0.5", RATING_BADGE_CLASS[scorecard.rating])}>
                    {TA_SCORECARD_RATING_LABELS[scorecard.rating]}
                  </span>
                </div>
                {scorecard.comments ? <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{scorecard.comments}</p> : null}
                <p className="text-muted-foreground mt-1">{formatRelative(scorecard.updatedAt)}</p>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {canScore ? (
        editing ? (
          <ScorecardForm
            defaultRating={mine?.rating}
            defaultComments={mine?.comments ?? ""}
            pending={mutation.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={(rating, comments) =>
              mutation.mutate(() => submitTaScorecard({ applicationStageId, requestId, stage, rating, comments }))
            }
          />
        ) : (
          <Button size="sm" variant="ghost" className="mt-1.5 h-7 px-2 text-xs" onClick={() => setEditing(true)}>
            {mine ? "Edit my scorecard" : "Add my scorecard"}
          </Button>
        )
      ) : null}
    </div>
  );
}

function ScorecardForm({
  defaultRating,
  defaultComments,
  pending,
  onCancel,
  onSubmit,
}: {
  defaultRating?: TaScorecardRow["rating"];
  defaultComments: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (rating: TaScorecardRow["rating"], comments: string) => void;
}) {
  const [rating, setRating] = React.useState<TaScorecardRow["rating"] | undefined>(defaultRating);
  const [comments, setComments] = React.useState(defaultComments);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {TA_SCORECARD_RATING_VALUES.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={rating === value ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            disabled={pending}
            onClick={() => setRating(value)}
          >
            {TA_SCORECARD_RATING_LABELS[value]}
          </Button>
        ))}
      </div>
      <Textarea
        value={comments}
        onChange={(event) => setComments(event.target.value)}
        placeholder="Comments (optional)"
        rows={2}
        disabled={pending}
        className="text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!rating || pending}
          onClick={() => rating && onSubmit(rating, comments)}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}
