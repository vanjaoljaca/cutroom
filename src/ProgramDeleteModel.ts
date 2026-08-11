export function shiftSelectedCutOverlays(project: VideoProject, deletionStart: number, deletionDuration: number): VideoProject {
  const shift = <T extends { start: number; end: number }>(target: T): T => ({ ...target, start: shifted(target.start, deletionStart, deletionDuration), end: shifted(target.end, deletionStart, deletionDuration) });
  const overlays = project.overlays.map((overlay) => overlay.target.type === "selected-cut" ? { ...overlay, target: selectedTarget(shift(overlay.target)) } : overlay);
  const videoOverlays = project.videoOverlays.map((overlay) => ({ ...overlay, target: selectedTarget(shift(overlay.target)) }));
  const textOverlays = project.textOverlays.map((overlay) => overlay.target.type === "selected-cut" ? { ...overlay, target: selectedTarget(shift(overlay.target)) } : overlay);
  return { ...project, overlays, videoOverlays, textOverlays };
}

function shifted(value: number, start: number, duration: number) {
  if (value <= start) return value;
  return value >= start + duration ? value - duration : start;
}
function selectedTarget(interval: { start: number; end: number }) { return { type: "selected-cut" as const, start: interval.start, end: interval.end }; }

import type { VideoProject } from "./analysis-model";
