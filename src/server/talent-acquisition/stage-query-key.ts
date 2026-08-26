export function taCandidateStagesQueryKey(candidateId: string) {
  return ["ta-candidate-stages", candidateId] as const;
}
