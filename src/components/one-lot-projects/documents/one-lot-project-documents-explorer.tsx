"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FolderOpen, FolderPlus, Loader2, Upload } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  createOneLotProjectDocumentFolder,
  deleteOneLotProjectDocument,
  fetchOneLotProjectDocumentFolder,
  renameOneLotProjectDocument,
  uploadOneLotProjectDocument,
} from "@/server/one-lot-projects/document-actions";
import type { DocumentFolderData, DocumentRow as DocumentRowData } from "@/server/one-lot-projects/document-types";

import { DocumentRow } from "./document-row";

type OneLotProjectDocumentsExplorerProps = {
  projectId: string;
  initialFolder: DocumentFolderData;
};

export function OneLotProjectDocumentsExplorer({ projectId, initialFolder }: OneLotProjectDocumentsExplorerProps) {
  const [folderId, setFolderId] = React.useState<string | null>(initialFolder.currentFolderId);
  const [dragActive, setDragActive] = React.useState(false);
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const [renaming, setRenaming] = React.useState<DocumentRowData | null>(null);
  const [deleting, setDeleting] = React.useState<DocumentRowData | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dragCounter = React.useRef(0);
  const queryClient = useQueryClient();

  const queryKey = ["one-lot-project-documents", projectId, folderId];
  const { data: folder, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchOneLotProjectDocumentFolder(projectId, folderId),
    initialData: folderId === initialFolder.currentFolderId ? initialFolder : undefined,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["one-lot-project-documents", projectId] });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createOneLotProjectDocumentFolder({ projectId, parentId: folderId, name }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setCreatingFolder(false);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("projectId", projectId);
      if (folderId) formData.append("parentId", folderId);
      formData.append("file", file);
      return uploadOneLotProjectDocument(formData);
    },
    onSuccess: (result) => {
      if (result.ok) invalidate();
      else toast.error(result.error);
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => renameOneLotProjectDocument({ projectId, id: renaming!.id, name }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setRenaming(null);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOneLotProjectDocument({ projectId, id: deleting!.id }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setDeleting(null);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    for (const file of list) {
      uploadMutation.mutate(file, {
        onSuccess: (result) => {
          if (!result.ok) toast.error(`${file.name}: ${result.error}`);
        },
      });
    }
  }

  function openDocument(document: DocumentRowData) {
    if (document.type === "folder") {
      setFolderId(document.id);
      return;
    }
    window.open(`/api/one-lot-projects/${projectId}/documents/${document.id}`, "_blank", "noopener,noreferrer");
  }

  function downloadDocument(document: DocumentRowData) {
    window.open(`/api/one-lot-projects/${projectId}/documents/${document.id}?download=1`, "_blank", "noopener,noreferrer");
  }

  const items = folder?.items ?? initialFolder.items;
  const breadcrumbs = folder?.breadcrumbs ?? initialFolder.breadcrumbs;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Breadcrumbs breadcrumbs={breadcrumbs} onNavigate={setFolderId} />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreatingFolder(true)}>
              <FolderPlus className="size-4" aria-hidden />
              New folder
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" aria-hidden />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) uploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        <div
          className={cn(
            "relative rounded-lg border transition-colors",
            dragActive && "border-brand bg-brand/5 ring-brand/20 ring-2",
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            dragCounter.current += 1;
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            dragCounter.current -= 1;
            if (dragCounter.current <= 0) setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragCounter.current = 0;
            setDragActive(false);
            if (event.dataTransfer.files.length > 0) uploadFiles(event.dataTransfer.files);
          }}
        >
          {dragActive ? (
            <div className="bg-card/95 pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg">
              <Upload className="text-brand size-8" aria-hidden />
              <p className="text-sm font-medium">Drop to upload</p>
            </div>
          ) : null}

          {isLoading && !folder ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="This folder is empty"
              description="Drag files here, or use Upload above."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Modified</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded by</TableHead>
                  <TableHead className="w-10" aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((document) => (
                  <DocumentRow
                    key={document.id}
                    document={document}
                    onOpen={() => openDocument(document)}
                    onDownload={() => downloadDocument(document)}
                    onRename={() => setRenaming(document)}
                    onDelete={() => setDeleting(document)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {uploadMutation.isPending ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Uploading…
          </p>
        ) : null}
      </CardContent>

      <NameDialog
        open={creatingFolder}
        title="New folder"
        submitLabel="Create"
        pending={createFolderMutation.isPending}
        onOpenChange={setCreatingFolder}
        onSubmit={(name) => createFolderMutation.mutate(name)}
      />

      <NameDialog
        open={Boolean(renaming)}
        title={`Rename ${renaming?.type === "folder" ? "folder" : "file"}`}
        submitLabel="Rename"
        initialValue={renaming?.name ?? ""}
        pending={renameMutation.isPending}
        onOpenChange={(open) => !open && setRenaming(null)}
        onSubmit={(name) => renameMutation.mutate(name)}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.type === "folder" ? "this folder" : "this file"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{deleting.name}</span>
                  {deleting.type === "folder"
                    ? " and everything inside it will be deleted. This can't be undone."
                    : " will be deleted. This can't be undone."}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Breadcrumbs({
  breadcrumbs,
  onNavigate,
}: {
  breadcrumbs: { id: string; name: string }[];
  onNavigate: (id: string | null) => void;
}) {
  return (
    <nav aria-label="Folder path" className="flex min-w-0 flex-1 items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 font-medium transition-colors",
          breadcrumbs.length === 0 ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent",
        )}
      >
        Documents
      </button>
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        return (
          <React.Fragment key={crumb.id}>
            <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            <button
              type="button"
              onClick={() => onNavigate(crumb.id)}
              disabled={isLast}
              className={cn(
                "min-w-0 truncate rounded px-1.5 py-0.5 font-medium transition-colors",
                isLast ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

type NameDialogProps = {
  open: boolean;
  title: string;
  submitLabel: string;
  initialValue?: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
};

/**
 * Only mounts `NameForm` while `open` — the same "remount resets state, no
 * effect needed" convention `CreateWorkItemDialog` uses, so `renaming`'s
 * `initialValue` (a different document each time) always starts fresh
 * without syncing state to a prop via `useEffect`.
 */
function NameDialog({ open, onOpenChange, ...formProps }: NameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {open ? <NameForm onOpenChange={onOpenChange} {...formProps} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  title,
  submitLabel,
  initialValue = "",
  pending,
  onOpenChange,
  onSubmit,
}: Omit<NameDialogProps, "open">) {
  const [name, setName] = React.useState(initialValue);
  const trimmed = name.trim();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">Enter a name and confirm.</DialogDescription>
      </DialogHeader>
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={pending}
        onKeyDown={(event) => {
          if (event.key === "Enter" && trimmed) onSubmit(trimmed);
        }}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" disabled={!trimmed || pending} onClick={() => onSubmit(trimmed)}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
