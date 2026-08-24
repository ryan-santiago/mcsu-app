"use client";

import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/format";
import { DOCUMENT_KIND_COLOR_CLASSNAME, DOCUMENT_KIND_ICONS, getDocumentKind } from "@/lib/one-lot-project-document-format";
import type { DocumentRow as DocumentRowData } from "@/server/one-lot-projects/document-types";

type DocumentRowProps = {
  document: DocumentRowData;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export function DocumentRow({ document, onOpen, onDownload, onRename, onDelete }: DocumentRowProps) {
  const kind = getDocumentKind(document.name, document.mimeType, document.type === "folder");
  const Icon = DOCUMENT_KIND_ICONS[kind];

  return (
    <TableRow>
      <TableCell>
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-2.5 text-left">
          <Icon className={`size-4.5 shrink-0 ${DOCUMENT_KIND_COLOR_CLASSNAME[kind]}`} aria-hidden />
          <span className="truncate text-sm font-medium">{document.name}</span>
        </button>
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap text-sm" title={formatDateTime(document.updatedAt)}>
        {formatRelative(document.updatedAt)}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm tabular-nums">
        {document.type === "file" ? formatBytes(document.size) : "—"}
      </TableCell>
      <TableCell className="text-muted-foreground truncate text-sm">{document.uploadedByName ?? "—"}</TableCell>
      <TableCell className="w-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${document.name}`}>
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpen}>{document.type === "folder" ? "Open" : "Preview"}</DropdownMenuItem>
            {document.type === "file" ? <DropdownMenuItem onSelect={onDownload}>Download</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
