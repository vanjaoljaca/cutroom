export function projectIdFromLocation(pathname: string, search: string): string | null {
  return projectIdFromPath(pathname) || legacyProjectId(search);
}

export function canonicalProjectPath(projectId: string): string {
  return `/project/${encodeURIComponent(projectId)}`;
}

export function recordingIdFromLocation(pathname: string): string | null {
  return idFromPath(pathname, "recording");
}

export function canonicalRecordingPath(recordingId: string): string {
  return `/recording/${encodeURIComponent(recordingId)}`;
}

export function legacyProjectRedirect(pathname: string, search: string): string | null {
  if (projectIdFromPath(pathname)) return null;
  const projectId = legacyProjectId(search);
  return projectId ? canonicalProjectPath(projectId) : null;
}

export function projectWebUrl(projectId: string, origin = "http://capcut"): string {
  return `${origin}${canonicalProjectPath(projectId)}`;
}

function projectIdFromPath(pathname: string): string | null {
  return idFromPath(pathname, "project");
}

function idFromPath(pathname: string, kind: "project" | "recording"): string | null {
  const match = pathname.match(new RegExp(`^/${kind}/([^/]+)/?$`));
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch { return null; }
}

function legacyProjectId(search: string): string | null {
  return new URLSearchParams(search).get("project");
}
