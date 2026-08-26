export function taApplicationStagesQueryKey(applicationId: string) {
  return ["ta-application-stages", applicationId] as const;
}
