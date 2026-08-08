export type ViewMode = "cut" | "original";

export type SourceRange = {
  id: string;
  clipId?: string;
  order: number;
  start: number;
  end: number;
  sourceId?: string;
  kind?: "scene" | "source";
  label?: string;
  sceneOrder?: number;
  takeOrder?: number;
  sceneId?: string;
  takeId?: string;
};

export function cutDuration(ranges: SourceRange[]): number {
  return ranges.reduce((total, range) => total + range.end - range.start, 0);
}

export function sourceTimeFromCutTime(ranges: SourceRange[], time: number): number {
  const match = locateCutTime(ranges, time);
  return match.range.start + match.offset;
}

export function sourceLocationFromCutTime(ranges: SourceRange[], time: number): SourceLocation {
  const match = locateCutTime(ranges, time);
  return { rangeIndex: match.index, sourceTime: match.range.start + match.offset, sourceId: match.range.sourceId || "media.primary" };
}

export function cutTimeFromSource(ranges: SourceRange[], index: number, time: number): number {
  const safeIndex = clamp(index, 0, Math.max(0, ranges.length - 1));
  const range = ranges[safeIndex];
  if (!range) return 0;
  const before = cutDuration(ranges.slice(0, safeIndex));
  return before + clamp(time - range.start, 0, range.end - range.start);
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

function locateCutTime(ranges: SourceRange[], time: number) {
  let cursor = Math.max(0, time);
  for (let index = 0; index < ranges.length; index += 1) {
    const length = ranges[index].end - ranges[index].start;
    if (cursor <= length || index === ranges.length - 1) return { range: ranges[index], index, offset: clamp(cursor, 0, length) };
    cursor -= length;
  }
  return { range: ranges[0], index: 0, offset: 0 };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export type SourceLocation = { rangeIndex: number; sourceTime: number; sourceId: string };
