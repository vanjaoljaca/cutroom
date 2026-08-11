export function videoOverlayProgramIntervals(project: VideoProject, ranges: SourceRange[]): VideoOverlayProgramInterval[] {
  const duration = cutDuration(ranges);
  return project.videoOverlays.map((overlay) => intervalForOverlay(overlay, duration)).filter((interval): interval is VideoOverlayProgramInterval => Boolean(interval));
}

export function videoOverlayWithProgramInterval(overlay: VideoOverlay, ranges: SourceRange[], start: number, end: number, sourceDuration = Number.POSITIVE_INFINITY): VideoOverlay {
  const duration = cutDuration(ranges);
  const nextStart = clamp(start, 0, duration - minimumDuration);
  const maximumEnd = Math.min(duration, nextStart + sourceDuration - overlay.sourceStart);
  const nextEnd = clamp(end, nextStart + minimumDuration, maximumEnd);
  const source = adjustedSourceInterval(overlay, nextStart, nextEnd);
  return { ...overlay, ...source, target: { type: "selected-cut", start: nextStart, end: nextEnd } };
}

function intervalForOverlay(overlay: VideoOverlay, duration: number): VideoOverlayProgramInterval | null {
  const start = clamp(overlay.target.start, 0, duration);
  const end = clamp(overlay.target.end, start, duration);
  return end - start >= minimumDuration ? { overlay, start, end } : null;
}

function adjustedSourceInterval(overlay: VideoOverlay, start: number, end: number) {
  const old = overlay.target;
  if (Math.abs(start - old.start) > epsilon && Math.abs(end - old.end) <= epsilon) return { sourceStart: overlay.sourceStart + start - old.start, sourceEnd: overlay.sourceEnd };
  if (Math.abs(end - old.end) > epsilon && Math.abs(start - old.start) <= epsilon) return { sourceStart: overlay.sourceStart, sourceEnd: overlay.sourceEnd + end - old.end };
  return { sourceStart: overlay.sourceStart, sourceEnd: overlay.sourceStart + end - start };
}

function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }

const minimumDuration = 0.08;
const epsilon = 0.002;
export type VideoOverlayProgramInterval = { overlay: VideoOverlay; start: number; end: number };

import type { VideoOverlay, VideoProject } from "./analysis-model";
import { cutDuration, type SourceRange } from "./editor-model";
