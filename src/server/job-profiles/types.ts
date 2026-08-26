export type JobProfileRow = {
  id: string;
  positionId: string;
  positionName: string;
  levelId: string;
  levelName: string;
  /** Sanitized HTML from the shared rich text editor, or null if left blank. */
  jobDescription: string | null;
  jobQualification: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** "Position — Level", for the Talent Acquisition Request form's picker. */
export type JobProfileOption = { id: string; label: string };
