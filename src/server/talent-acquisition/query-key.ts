export function taRequestsQueryKey() {
  return ["ta-requests"] as const;
}

export function taRequestQueryKey(id: string) {
  return ["ta-requests", id] as const;
}
