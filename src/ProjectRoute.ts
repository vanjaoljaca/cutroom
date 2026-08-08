export function projectIdFromLocation(pathname: string, search: string): string | null {
  return projectIdFromPath(pathname) || legacyProjectId(search);
}

export function canonicalProjectPath(projectId: string): string {
  return `/project/${encodeURIComponent(projectId)}`;
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
  const match = pathname.match(/^\/project\/([^/]+)\/?$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch { return null; }
}

function legacyProjectId(search: string): string | null {
  return new URLSearchParams(search).get("project");
}
