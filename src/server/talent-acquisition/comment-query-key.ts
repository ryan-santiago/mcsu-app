export function taCandidateCommentsQueryKey(candidateId: string) {
  return ["ta-candidate-comments", candidateId] as const;
}
