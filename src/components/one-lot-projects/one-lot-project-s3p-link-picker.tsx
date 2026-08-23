"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { useDebounced } from "@/hooks/use-debounced";
import { linkOneLotProjectS3pProject, searchOneLotProjectS3pProjects } from "@/server/one-lot-projects/actions";
import type { ProjectSearchOption } from "@/server/projects/types";

type OneLotProjectS3pLinkPickerProps = {
  oneLotProjectId: string;
  onLinked: () => void;
};

/** Search-as-you-type by name or S3P number, then link on select — no extra fields to collect, unlike the Staff Augmentation deployment picker this is modeled on. */
export function OneLotProjectS3pLinkPicker({ oneLotProjectId, onLinked }: OneLotProjectS3pLinkPickerProps) {
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search);

  const projectOptions = useQuery({
    queryKey: ["one-lot-project-s3p-search", oneLotProjectId, debouncedSearch],
    queryFn: () => searchOneLotProjectS3pProjects(oneLotProjectId, debouncedSearch),
  });

  const mutation = useMutation({
    mutationFn: (option: ProjectSearchOption) => linkOneLotProjectS3pProject({ oneLotProjectId, projectId: option.id }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        onLinked();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          autoFocus
          placeholder="Search by project name or S3P number"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-8"
          disabled={mutation.isPending}
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border p-1">
        {projectOptions.isLoading ? (
          <p className="text-muted-foreground p-3 text-sm">Loading…</p>
        ) : projectOptions.data?.length ? (
          projectOptions.data.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(option)}
              className="hover:bg-accent/60 flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="truncate text-sm font-medium">{option.name}</span>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">{option.s3pNumber}</span>
            </button>
          ))
        ) : (
          <p className="text-muted-foreground p-3 text-sm">
            {debouncedSearch ? "No matching S3P projects." : "No S3P projects found."}
          </p>
        )}
      </div>
      {mutation.isPending ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Linking…
        </p>
      ) : null}
    </div>
  );
}
