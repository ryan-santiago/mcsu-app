import type { TaScorecardRating } from "@/db/schema";

export type TaScorecardRow = {
  id: string;
  applicationStageId: string;
  evaluatorId: string | null;
  evaluatorName: string | null;
  rating: TaScorecardRating;
  comments: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const TA_SCORECARD_RATING_LABELS: Record<TaScorecardRating, string> = {
  strong_yes: "Strong Yes",
  yes: "Yes",
  no: "No",
  strong_no: "Strong No",
};

export const TA_SCORECARD_RATING_VALUES: readonly TaScorecardRating[] = ["strong_yes", "yes", "no", "strong_no"];
