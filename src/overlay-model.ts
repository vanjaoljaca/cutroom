export function visibleImageOverlays(project: VideoProject, mode: ViewMode, sourceTime: number, cutTime: number): ImageOverlay[] {
  if (mode !== "cut") return [];
  return project.overlays.filter((overlay) => isVisible(project, overlay, sourceTime, cutTime)).sort((left, right) => left.layer - right.layer || left.id.localeCompare(right.id));
}

export function imageOverlayCutIntervals(project: VideoProject, ranges: SourceRange[]): ImageOverlayCutInterval[] {
  const duration = cutDuration(ranges);
  return project.overlays.flatMap((overlay) => {
    if (overlay.target.type === "selected-cut") return [{ overlay, start: overlay.target.start, end: Math.min(duration, overlay.target.end) }];
    const target = overlay.target;
    const index = ranges.findIndex((range) => range.sceneId === target.sceneId && range.takeId === target.takeId);
    if (index < 0) return [];
    const before = cutDuration(ranges.slice(0, index));
    return [{ overlay, start: before + target.start, end: Math.min(before + ranges[index].end - ranges[index].start, before + target.end) }];
  }).filter((interval) => interval.end > interval.start);
}

export function imageOverlayWithCutInterval(overlay: ImageOverlay, ranges: SourceRange[], start: number, end: number): ImageOverlay {
  const duration = cutDuration(ranges);
  const globalStart = clamp(start, 0, duration - 0.08);
  const globalEnd = clamp(end, globalStart + 0.08, duration);
  if (overlay.target.type === "selected-cut") return { ...overlay, target: { ...overlay.target, start: globalStart, end: globalEnd } };
  const target = overlay.target;
  const index = ranges.findIndex((range) => range.sceneId === target.sceneId && range.takeId === target.takeId);
  if (index < 0) throw new Error(`Overlay target is not in the selected cut: ${overlay.id}`);
  const before = cutDuration(ranges.slice(0, index));
  const takeDuration = ranges[index].end - ranges[index].start;
  if (globalStart < before - 0.001 || globalEnd > before + takeDuration + 0.001) return { ...overlay, target: { type: "selected-cut", start: globalStart, end: globalEnd } };
  return { ...overlay, target: { ...target, start: globalStart - before, end: globalEnd - before } };
}

function isVisible(project: VideoProject, overlay: ImageOverlay, sourceTime: number, cutTime: number): boolean {
  const target = overlay.target;
  if (target.type === "selected-cut") return within(cutTime, target.start, target.end);
  const scene = project.scenes.find((item) => item.id === target.sceneId);
  const take = scene?.takes.find((item) => item.id === target.takeId);
  if (!take?.selected) return false;
  return within(sourceTime, take.start + target.start, take.start + target.end);
}

function within(time: number, start: number, end: number): boolean {
  return time >= start && time < end;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

import type { ImageOverlay, VideoProject } from "./analysis-model";
import { cutDuration, type SourceRange, type ViewMode } from "./editor-model";

export type ImageOverlayCutInterval = { overlay: ImageOverlay; start: number; end: number };
