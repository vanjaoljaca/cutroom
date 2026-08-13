export function normalizedSubjectTrackId(overlay: Pick<SubjectCutoutOverlay, "label"> & { subjectTrackId?: string }): string {
  if (overlay.subjectTrackId && /^subject\.[a-z0-9.-]+$/.test(overlay.subjectTrackId)) return overlay.subjectTrackId;
  const base = overlay.label.replace(/\s*[—-]\s*\d+\s*$/, "").replace(/\bkeyed over\b.*$/i, "").trim() || "subject";
  return `subject.${base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function subjectTrackLabel(overlays: SubjectCutoutOverlay[]): string {
  const first = overlays[0]?.label.replace(/\s*[—-]\s*\d+\s*$/, "").trim() || "Subject";
  return first.replace(/\s+keyed over\b.*$/i, "") || first;
}

export function subjectTrackOverlays(project: VideoProject, subjectTrackId: string) {
  return project.cutoutOverlays.filter((overlay) => normalizedSubjectTrackId(overlay) === subjectTrackId);
}

export function groupedSubjectIntervals(intervals: CutoutProgramInterval[]) {
  const tracks = new Map<string, CutoutProgramInterval[]>();
  intervals.forEach((interval) => addInterval(tracks, interval));
  tracks.forEach((segments) => segments.sort((a, b) => a.start - b.start));
  return tracks;
}

function addInterval(tracks: Map<string, CutoutProgramInterval[]>, interval: CutoutProgramInterval) {
  const id = normalizedSubjectTrackId(interval.overlay);
  tracks.set(id, [...(tracks.get(id) || []), interval]);
}

import type { SubjectCutoutOverlay, VideoProject } from "./analysis-model";
import type { CutoutProgramInterval } from "./CutoutOverlayModel";
