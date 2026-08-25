"use client";

import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RICH_TEXT_CONTENT_CLASSNAME } from "@/components/ui/rich-text-editor";
import { cn } from "@/lib/utils";
import { ANNOUNCEMENT_TYPE_LABELS, type AnnouncementRow } from "@/server/announcements/types";

type AnnouncementDetailDialogProps = {
  /** The announcement to show in full, or `null` to close. */
  announcement: AnnouncementRow | null;
  onOpenChange: (open: boolean) => void;
};

/** Read-only "Read more" popup — the full, unclamped version of a feed row. */
export function AnnouncementDetailDialog({ announcement, onOpenChange }: AnnouncementDetailDialogProps) {
  return (
    <Dialog open={Boolean(announcement)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {announcement ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{announcement.title}</DialogTitle>
                <Badge variant="secondary" className="shrink-0 font-normal">
                  {ANNOUNCEMENT_TYPE_LABELS[announcement.type]}
                </Badge>
              </div>
              <DialogDescription>
                {format(parseISO(announcement.announcementDate), "MMMM d, yyyy")}
                {announcement.createdBy ? ` · Posted by ${announcement.createdBy.name}` : null}
              </DialogDescription>
            </DialogHeader>

            {announcement.description ? (
              <div
                className={cn(RICH_TEXT_CONTENT_CLASSNAME, "text-sm")}
                dangerouslySetInnerHTML={{ __html: announcement.description }}
              />
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
