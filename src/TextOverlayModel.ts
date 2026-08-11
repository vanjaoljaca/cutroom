export function textOverlayProgramInterval(overlay: TextOverlay, ranges: SourceRange[]): TextOverlayProgramInterval | null {
  if (!overlay.enabled) return null;
  if (overlay.target.type === "selected-cut") return boundedInterval(overlay, overlay.target.start, overlay.target.end, cutDuration(ranges));
  const target = overlay.target;
  const index = ranges.findIndex((range) => range.clipId === target.clipId && range.sourceId === target.sourceId);
  if (index < 0) return null;
  const range = ranges[index];
  const start = cutDuration(ranges.slice(0, index)) + Math.max(0, target.sourceStart - range.start);
  const end = cutDuration(ranges.slice(0, index)) + Math.min(range.end - range.start, target.sourceEnd - range.start);
  return boundedInterval(overlay, start, end, cutDuration(ranges));
}

export function textOverlayProgramIntervals(project: VideoProject, ranges: SourceRange[]): TextOverlayProgramInterval[] {
  return project.textOverlays.map((overlay) => textOverlayProgramInterval(overlay, ranges)).filter((item): item is TextOverlayProgramInterval => Boolean(item)).sort((left, right) => left.overlay.layer - right.overlay.layer || left.start - right.start);
}

export function textOverlayWithProgramInterval(overlay: TextOverlay, ranges: SourceRange[], start: number, end: number): TextOverlay {
  if (overlay.target.type === "selected-cut") return { ...overlay, target: { type: "selected-cut", start, end } };
  const target = overlay.target;
  const index = ranges.findIndex((range) => range.clipId === target.clipId && range.sourceId === target.sourceId);
  if (index < 0) return overlay;
  const before = cutDuration(ranges.slice(0, index));
  return { ...overlay, target: { ...target, sourceStart: ranges[index].start + start - before, sourceEnd: ranges[index].start + end - before } };
}

function boundedInterval(overlay: TextOverlay, start: number, end: number, duration: number): TextOverlayProgramInterval | null {
  const boundedStart = clamp(start, 0, duration);
  const boundedEnd = clamp(end, boundedStart, duration);
  return boundedEnd - boundedStart >= 0.04 ? { overlay, start: boundedStart, end: boundedEnd } : null;
}

function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }

export type TextOverlayProgramInterval = { overlay: TextOverlay; start: number; end: number };

import type { TextOverlay, VideoProject } from "./analysis-model";
import type { SourceRange } from "./editor-model";
import { cutDuration } from "./editor-model";
