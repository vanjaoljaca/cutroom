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
  const active = preview?.rangeId === range.id ? preview : null;
  const previewStart = active?.edge === "start" ? active.value : range.start;
  const previewEnd = active?.edge === "end" ? active.value : range.end;
  const offset = ((previewStart - range.start) / total) * 100;
  const width = ((previewEnd - previewStart) / total) * 100;
  return { range, left: left + offset, width, shortened: (previewStart - range.start) + (range.end - previewEnd), edge: active?.edge || null };
}

export type TimelineTrimPreview = { rangeId: string; edge: "start" | "end"; value: number };
export type TimelineTrimPosition = { range: SourceRange; left: number; width: number; shortened: number; edge: "start" | "end" | null };

import { cutDuration, type SourceRange } from "./editor-model";
