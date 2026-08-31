"use client";

import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/format";
import { DOCUMENT_KIND_COLOR_CLASSNAME, DOCUMENT_KIND_ICONS, getDocumentKind } from "@/lib/one-lot-project-document-format";
import type { DocumentRow as DocumentRowData } from "@/server/one-lot-projects/document-types";

/** The drag payload's MIME type — scoped so this table never reacts to an unrelated drag (e.g. dragging a browser tab or an OS file) landing on a folder row. */
export const DOCUMENT_DRAG_MIME = "application/x-mcsu-document-id";

type DocumentRowProps = {
  document: DocumentRowData;
  selected: boolean;
  isDropTarget: boolean;
  onSelectChange: (checked: boolean) => void;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropTargetChange: (isOver: boolean) => void;
  onDropItem: (draggedId: string) => void;
};

export function DocumentRow({
  document,
  selected,
  isDropTarget,
  onSelectChange,
  onOpen,
  onDownload,
  onRename,
  onDelete,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDropItem,
}: DocumentRowProps) {
  const kind = getDocumentKind(document.name, document.mimeType, document.type === "folder");
  const Icon = DOCUMENT_KIND_ICONS[kind];
  const isFolder = document.type === "folder";

  return (
    <TableRow
      className={cn(isDropTarget && "bg-brand/10")}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DOCUMENT_DRAG_MIME, document.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!isFolder || !event.dataTransfer.types.includes(DOCUMENT_DRAG_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={(event) => {
        if (!isFolder || !event.dataTransfer.types.includes(DOCUMENT_DRAG_MIME)) return;
        event.preventDefault();
        onDropTargetChange(true);
      }}
      onDragLeave={() => {
        if (isFolder) onDropTargetChange(false);
      }}
      onDrop={(event) => {
        if (!isFolder) return;
        event.preventDefault();
        onDropTargetChange(false);
        const draggedId = event.dataTransfer.getData(DOCUMENT_DRAG_MIME);
        if (draggedId && draggedId !== document.id) onDropItem(draggedId);
      }}
    >
      <TableCell className="w-8">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelectChange(checked === true)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${document.name}`}
        />
      </TableCell>
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
