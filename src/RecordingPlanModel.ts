export function recordingPlanForProject(project: VideoProject): RecordingPlan {
  if (project.recordingPlan) return project.recordingPlan;
  const sourceId = project.mediaLibrary.primarySourceId;
  const sourceRanges = project.programTimeline.clips.filter((clip) => clip.sourceId === sourceId).map((clip) => ({ start: clip.sourceStart, end: clip.sourceEnd }));
  const projectTitle = (project.title || project.sourceName || "Untitled project").trim();
  const sourceLabel = (project.sourceName || project.title || "Source recording").trim();
  return { version: 1, sourceId, sourceLabel, outputs: [{ id: "output.current", projectId: project.id, projectTitle, intent: "new", status: "ready", summary: "", sourceRanges }] };
}

export function recordingPlanDuration(plan: RecordingPlan, fallback: number) {
  const end = Math.max(0, ...plan.outputs.flatMap((output) => output.sourceRanges.map((range) => range.end)));
  return Math.max(fallback, end);
}

export function recordingPlanCoverage(output: RecordingPlanOutput) {
  return output.sourceRanges.reduce((total, range) => total + range.end - range.start, 0);
}

export function recordingIntentLabel(intent: RecordingPlanOutput["intent"]) {
  return intent === "existing" ? "Existing" : null;
}

export function recordingOutputRanges(plan: RecordingPlan, output: RecordingPlanOutput): SourceRange[] {
  return output.sourceRanges.map((range, index) => ({ id: `${output.id}.${index + 1}`, order: index + 1, start: range.start, end: range.end, sourceId: plan.sourceId, kind: "source", label: output.projectTitle }));
}

import type { RecordingPlan, RecordingPlanOutput, VideoProject } from "./analysis-model";
import type { SourceRange } from "./editor-model";
