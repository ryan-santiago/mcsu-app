"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { boardColumnFormSchema } from "@/lib/validation/one-lot-project-backlog";
import { createOneLotProjectBoardColumn } from "@/server/one-lot-projects/backlog-actions";

type AddColumnButtonProps = {
  projectId: string;
};

export function AddColumnButton({ projectId }: AddColumnButtonProps) {
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createOneLotProjectBoardColumn({ projectId, name }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setName("");
        setAdding(false);
        queryClient.invalidateQueries({ queryKey: ["one-lot-project-kanban", projectId] });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="text-muted-foreground hover:border-foreground/30 hover:text-foreground flex h-11 w-64 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm transition-colors"
      >
        <Plus className="size-4" aria-hidden />
        Add column
      </button>
    );
  }

  const valid = boardColumnFormSchema.safeParse({ name }).success;

  return (
    <div className="flex w-64 shrink-0 items-center gap-1.5">
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Column name"
        disabled={mutation.isPending}
        onKeyDown={(event) => {
          if (event.key === "Enter" && valid) mutation.mutate();
          if (event.key === "Escape") setAdding(false);
        }}
      />
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Add"}
      </Button>
    </div>
  );
}
