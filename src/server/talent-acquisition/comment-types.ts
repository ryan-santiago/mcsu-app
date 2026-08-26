export type TaCandidateCommentRow = {
  id: string;
  candidateId: string;
  body: string;
  author: { id: string; name: string; image: string | null } | null;
  createdAt: Date;
};
