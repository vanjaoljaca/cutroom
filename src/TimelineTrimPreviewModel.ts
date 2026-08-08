export function timelineTrimPositions(ranges: SourceRange[], preview: TimelineTrimPreview | null): TimelineTrimPosition[] {
  const total = cutDuration(ranges);
  let left = 0;
  return ranges.map((range) => {
    const position = timelineTrimPosition(range, preview, total, left);
    left += ((range.end - range.start) / total) * 100;
    return position;
  });
}

function timelineTrimPosition(range: SourceRange, preview: TimelineTrimPreview | null, total: number, left: number): TimelineTrimPosition {
  const previewEnd = preview?.rangeId === range.id ? preview.end : range.end;
  const width = ((previewEnd - range.start) / total) * 100;
  return { range, left, width, shortened: range.end - previewEnd };
}

export type TimelineTrimPreview = { rangeId: string; end: number };
export type TimelineTrimPosition = { range: SourceRange; left: number; width: number; shortened: number };

import { cutDuration, type SourceRange } from "./editor-model";
