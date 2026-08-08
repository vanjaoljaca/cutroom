export function normalizeProjectTitle(value: string): string {
  const title = value.trim().replace(/\s+/g, " ");
  if (!title || title.length > 80 || /[\u0000-\u001f]/.test(title)) throw new Error("Project name must be 1–80 readable characters.");
  return title;
}

export function displayProjectTitle(value: string): string {
  return normalizeProjectTitle(value.replaceAll("_", " "));
}

export function exportProjectTitle(value: string): string {
  const title = displayProjectTitle(value).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return title || "Cutroom";
}
