export function rawRecordingViewer(project: VideoProject, sourceTime = 0): RecordingViewerSelection {
  const plan = recordingPlanForProject(project);
  return { kind: "raw", projectId: project.id, outputId: null, mode: "original", sourceId: plan.sourceId, sourceTime, ranges: [], duration: null };
}

export function projectRecordingViewer(output: RecordingPlanOutput, project: VideoProject): RecordingViewerSelection {
  if (output.projectId !== project.id) throw new Error(`Output ${output.id} does not belong to project ${project.id}.`);
  const ranges = programRanges(project);
  if (!ranges.length) throw new Error(`${output.projectTitle} has no assembled program clips.`);
  const sourceId = ranges[0].sourceId || project.mediaLibrary.primarySourceId;
  return { kind: "project", projectId: project.id, outputId: output.id, mode: "cut", sourceId, sourceTime: ranges[0].start, ranges, duration: cutDuration(ranges) };
}

export function recordingPhaseProject(current: VideoProject | null, selected: VideoProject | null): VideoProject | null {
  return selected || current;
}

export type RecordingViewerSelection = {
  kind: "raw" | "project";
  projectId: string;
  outputId: string | null;
  mode: ViewMode;
  sourceId: string;
  sourceTime: number;
  ranges: SourceRange[];
  duration: number | null;
};

import type { RecordingPlanOutput, VideoProject } from "./analysis-model";
import { cutDuration, type SourceRange, type ViewMode } from "./editor-model";
import { programRanges } from "./ProgramTimelineModel";
import { recordingPlanForProject } from "./RecordingPlanModel";
