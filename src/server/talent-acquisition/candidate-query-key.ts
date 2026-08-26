export function taCandidatesQueryKey(requestId: string) {
  return ["ta-candidates", requestId] as const;
}
