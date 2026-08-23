"use client";

import { useMutation } from "@tanstack/react-query";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
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
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { formatRelative } from "@/lib/format";
import { unlinkOneLotProjectS3pProject } from "@/server/one-lot-projects/actions";
import type { OneLotProjectS3pLinkRow } from "@/server/one-lot-projects/types";

import { OneLotProjectS3pLinkPicker } from "./one-lot-project-s3p-link-picker";

type OneLotProjectS3pLinksTableProps = {
  oneLotProjectId: string;
  links: OneLotProjectS3pLinkRow[];
  canEdit: boolean;
  canDelete: boolean;
};

export function OneLotProjectS3pLinksTable({ oneLotProjectId, links, canEdit, canDelete }: OneLotProjectS3pLinksTableProps) {
  const [linking, setLinking] = React.useState(false);
  const [unlinking, setUnlinking] = React.useState<OneLotProjectS3pLinkRow | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setUnlinking(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked S3P Projects</CardTitle>
        <CardAction>
          {canEdit ? (
            <Button size="sm" onClick={() => setLinking(true)}>
              <Plus className="size-4" aria-hidden />
              Link project
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        {links.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No S3P projects linked"
            description={canEdit ? "Link the S3P projects this One-Lot project spans." : "Linked S3P projects will appear here."}
            action={
              canEdit ? (
                <Button size="sm" onClick={() => setLinking(true)}>
                  <Plus className="size-4" aria-hidden />
                  Link project
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>S3P Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Linked</TableHead>
                  {canDelete ? <TableHead className="w-12" aria-label="Actions" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="text-muted-foreground font-mono text-xs">{link.s3pNumber}</TableCell>
                    <TableCell className="font-medium">{link.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatRelative(link.linkedAt)}</TableCell>
                    {canDelete ? (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={mutation.isPending}
                          aria-label={`Unlink ${link.name}`}
                          onClick={() => setUnlinking(link)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={linking} onOpenChange={setLinking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link S3P project</DialogTitle>
            <DialogDescription>Search by project name or S3P number, then select one to link it.</DialogDescription>
          </DialogHeader>
          {linking ? (
            <OneLotProjectS3pLinkPicker oneLotProjectId={oneLotProjectId} onLinked={() => setLinking(false)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(unlinking)} onOpenChange={(open) => !open && setUnlinking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink this S3P project?</AlertDialogTitle>
            <AlertDialogDescription>
              {unlinking ? (
                <>
                  <span className="text-foreground font-medium">{unlinking.name}</span> will no longer be linked to
                  this One-Lot project.
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
                if (!unlinking) return;
                mutation.mutate(() => unlinkOneLotProjectS3pProject({ id: unlinking.id, oneLotProjectId }));
              }}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
