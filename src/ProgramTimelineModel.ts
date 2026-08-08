export function createProgramTimeline(scenes: SceneProposal[], primarySourceId: string, createdAt: string): ProgramTimeline {
  const clips = selectedCutsFromScenes(scenes || []).map((cut) => ({
    id: sceneClipId(cut.sceneId!), kind: "scene" as const, sourceId: primarySourceId, label: cut.label,
    sourceStart: cut.start, sourceEnd: cut.end, sceneId: cut.sceneId!, takeId: cut.takeId!, createdAt,
  }));
  return { version: 1, clips };
}

export function programRanges(project: VideoProject): SourceRange[] {
  return project.programTimeline.clips.map((clip, index) => ({ id: clip.id, clipId: clip.id, order: index + 1, start: clip.sourceStart, end: clip.sourceEnd, sourceId: clip.sourceId, kind: clip.kind, label: clip.label, ...sceneRange(project, clip) }));
}

export function insertProgramClip(timeline: ProgramTimeline, clip: ProgramClip, index: number): ProgramTimeline {
  const clips = [...timeline.clips];
  clips.splice(clampIndex(index, clips.length), 0, clip);
  return { ...timeline, clips };
}

export function moveProgramClip(timeline: ProgramTimeline, id: string, direction: -1 | 1): ProgramTimeline {
  const index = timeline.clips.findIndex((clip) => clip.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= timeline.clips.length) return timeline;
  const clips = [...timeline.clips];
  [clips[index], clips[destination]] = [clips[destination], clips[index]];
  return { ...timeline, clips };
}

export function removeProgramClip(timeline: ProgramTimeline, id: string): ProgramTimeline {
  return { ...timeline, clips: timeline.clips.filter((clip) => clip.id !== id) };
}

export function trimProgramClip(timeline: ProgramTimeline, id: string, edge: "start" | "end", value: number): ProgramTimeline {
  return { ...timeline, clips: timeline.clips.map((clip) => clip.id === id ? trimClip(clip, edge, value) : clip) };
}

export function syncSceneClip(timeline: ProgramTimeline, scene: SceneProposal): ProgramTimeline {
  const take = scene.takes.find((candidate) => candidate.selected);
  if (!take) return timeline;
  return { ...timeline, clips: timeline.clips.map((clip) => clip.sceneId === scene.id ? { ...clip, takeId: take.id, label: scene.label, sourceStart: take.start, sourceEnd: take.end } : clip) };
}

export function sourceProgramClip(input: SourceProgramClipInput): ProgramClip {
  if (input.sourceEnd - input.sourceStart < minimumDuration) throw new Error("A program clip must be at least 0.08 seconds.");
  return { id: input.id, kind: "source", sourceId: input.sourceId, label: input.label.trim(), sourceStart: input.sourceStart, sourceEnd: input.sourceEnd, sceneId: null, takeId: null, createdAt: input.createdAt };
}

function sceneRange(project: VideoProject, clip: ProgramClip) {
  if (!clip.sceneId || !clip.takeId) return {};
  const scene = project.scenes.find((item) => item.id === clip.sceneId);
  const take = scene?.takes.find((item) => item.id === clip.takeId);
  return { sceneId: clip.sceneId, takeId: clip.takeId, sceneOrder: scene?.order, takeOrder: take?.order };
}

function trimClip(clip: ProgramClip, edge: "start" | "end", value: number): ProgramClip {
  if (edge === "start") return { ...clip, sourceStart: Math.min(value, clip.sourceEnd - minimumDuration) };
  return { ...clip, sourceEnd: Math.max(value, clip.sourceStart + minimumDuration) };
}

function sceneClipId(sceneId: string) { return `clip.scene.${sceneId.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}`; }
function clampIndex(index: number, length: number) { return Math.max(0, Math.min(length, index)); }

const minimumDuration = 0.08;

export type SourceProgramClipInput = { id: string; sourceId: string; label: string; sourceStart: number; sourceEnd: number; createdAt: string };

import type { ProgramClip, ProgramTimeline, SceneProposal, VideoProject } from "./analysis-model";
import type { SourceRange } from "./editor-model";
import { selectedCutsFromScenes } from "./ProjectCutModel";
