export function cutoutProgramInterval(overlay: SubjectCutoutOverlay, ranges: SourceRange[]): CutoutProgramInterval | null {
  const index = ranges.findIndex((range) => range.id === overlay.target.clipId);
  if (index < 0) return null;
  const clipDuration = ranges[index].end - ranges[index].start;
  const before = cutDuration(ranges.slice(0, index));
  const start = before + clamp(overlay.target.start, 0, clipDuration);
  const end = before + clamp(overlay.target.end, overlay.target.start, clipDuration);
  return end - start >= minimumDuration ? { overlay, start, end, rangeIndex: index, hostStart: before, hostEnd: before + clipDuration } : null;
}

export function cutoutProgramIntervals(project: VideoProject, ranges: SourceRange[]): CutoutProgramInterval[] {
  return project.cutoutOverlays.map((overlay) => cutoutProgramInterval(overlay, ranges)).filter((interval): interval is CutoutProgramInterval => Boolean(interval));
}

export function cutoutWithProgramInterval(overlay: SubjectCutoutOverlay, ranges: SourceRange[], start: number, end: number): SubjectCutoutOverlay {
  const index = ranges.findIndex((range) => range.id === overlay.target.clipId);
  if (index < 0) return overlay;
  const before = cutDuration(ranges.slice(0, index));
  const duration = ranges[index].end - ranges[index].start;
  const nextStart = clamp(start - before, 0, duration - minimumDuration);
  const sourceDuration = overlay.sourceEnd - overlay.sourceStart;
  return { ...overlay, target: { ...overlay.target, start: nextStart, end: clamp(end - before, nextStart + minimumDuration, Math.min(duration, nextStart + sourceDuration)) } };
}

function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }

const minimumDuration = 0.08;

export type CutoutProgramInterval = { overlay: SubjectCutoutOverlay; start: number; end: number; rangeIndex: number; hostStart: number; hostEnd: number };

import type { SubjectCutoutOverlay, VideoProject } from "./analysis-model";
import { cutDuration, type SourceRange } from "./editor-model";
