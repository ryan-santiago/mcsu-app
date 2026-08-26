export function taScorecardsQueryKey(applicationStageId: string) {
  return ["ta-scorecards", applicationStageId] as const;
}
