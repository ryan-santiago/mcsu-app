export function taApplicationsQueryKey(requestId: string) {
  return ["ta-applications", requestId] as const;
}

export function taApplicationQueryKey(applicationId: string) {
  return ["ta-application", applicationId] as const;
}
