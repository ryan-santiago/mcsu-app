"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative, initialsOf } from "@/lib/format";
import { addTaCandidateComment, fetchTaCandidateComments } from "@/server/talent-acquisition/comment-actions";
import { taCandidateCommentsQueryKey } from "@/server/talent-acquisition/comment-query-key";
import type { TaCandidateCommentRow } from "@/server/talent-acquisition/comment-types";

type CandidateCommentsProps = {
  candidateId: string;
  /** Omitted on the candidate's own profile page, which isn't scoped to one request. */
  requestId?: string;
  canComment: boolean;
};

export function CandidateComments({ candidateId, requestId, canComment }: CandidateCommentsProps) {
  const [body, setBody] = React.useState("");
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery<TaCandidateCommentRow[]>({
    queryKey: taCandidateCommentsQueryKey(candidateId),
    queryFn: () => fetchTaCandidateComments(candidateId),
  });

  const mutation = useMutation({
    mutationFn: () => addTaCandidateComment({ candidateId, requestId, body }),
    onSuccess: (result) => {
      if (result.ok) {
        setBody("");
        void queryClient.invalidateQueries({ queryKey: taCandidateCommentsQueryKey(candidateId) });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const comments = data ?? [];
  const canSubmit = body.trim().length > 0;

  return (
    <div className="space-y-3">
      <h4 className="text-muted-foreground text-xs font-medium">Comments</h4>

      {isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : comments.length > 0 ? (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex items-start gap-2.5">
              <Avatar size="sm" className="mt-0.5">
                <AvatarFallback>{comment.author ? initialsOf(comment.author.name) : "?"}</AvatarFallback>
              </Avatar>
              <div className="bg-muted/50 min-w-0 flex-1 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{comment.author?.name ?? "Unknown"}</span>
                  <span className="text-muted-foreground text-xs">{formatRelative(comment.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm whitespace-pre-wrap">{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">No comments yet.</p>
      )}

      {canComment ? (
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a comment..."
            rows={2}
            disabled={mutation.isPending}
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Comment
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
