import type { AnnouncementType } from "@/db/schema";

export type AnnouncementAuthor = { id: string; name: string; image: string | null };

export type AnnouncementRow = {
  id: string;
  /** ISO `yyyy-MM-dd`, matching the `date` column — see `DatePicker`. */
  announcementDate: string;
  type: AnnouncementType;
  title: string;
  /** Sanitized HTML from the shared rich text editor, or null if left blank. */
  description: string | null;
  createdBy: AnnouncementAuthor | null;
  createdAt: Date;
  updatedAt: Date;
};

export const ANNOUNCEMENT_TYPE_LABELS: Record<AnnouncementType, string> = {
  news: "News",
  activity: "Activities",
};

export const ANNOUNCEMENT_TYPES: readonly AnnouncementType[] = ["news", "activity"];

/** The board's tab filter — `"all"` plus every real `AnnouncementType`. */
export type AnnouncementTypeFilter = "all" | AnnouncementType;
