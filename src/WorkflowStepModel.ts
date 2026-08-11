export function workflowViewForRoute(recordingId: string | null) {
  return { mode: "original", step: recordingId ? "projects" : "original" } as const;
}
