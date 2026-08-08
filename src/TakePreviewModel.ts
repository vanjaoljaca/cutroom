export function takePreviewRestart(currentTime: number, preview: TakePreview | null): number | null {
  if (!preview || currentTime < preview.end - 0.04) return null;
  return preview.start;
}

export type TakePreview = { start: number; end: number };
