export function createProgramTimeline(scenes: SceneProposal[], primarySourceId: string, createdAt: string): ProgramTimeline {
  const clips = selectedCutsFromScenes(scenes || []).map((cut) => ({
    id: sceneClipId(cut.sceneId!), kind: "scene" as const, sourceId: primarySourceId, label: cut.label,
    sourceStart: cut.start, sourceEnd: cut.end, sceneId: cut.sceneId!, takeId: cut.takeId!, createdAt,
  }));
  return { version: 1, clips, deletedClips: [] };
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

export function deleteProgramClip(timeline: ProgramTimeline, id: string, editorialState: DeletedProgramClip["editorialState"], deletedAt: string): ProgramTimeline {
  const formerIndex = timeline.clips.findIndex((clip) => clip.id === id);
  const clip = timeline.clips[formerIndex];
  if (!clip) return timeline;
  const formerProgramStart = timeline.clips.slice(0, formerIndex).reduce((sum, item) => sum + item.sourceEnd - item.sourceStart, 0);
  const deleted = { clip, formerIndex, previousClipId: timeline.clips[formerIndex - 1]?.id || null, nextClipId: timeline.clips[formerIndex + 1]?.id || null, formerProgramStart, formerProgramEnd: formerProgramStart + clip.sourceEnd - clip.sourceStart, deletedAt, editorialState };
  return { ...timeline, clips: timeline.clips.filter((item) => item.id !== id), deletedClips: [...(timeline.deletedClips || []).filter((item) => item.clip.id !== id), deleted] };
}

export function restoreProgramClip(timeline: ProgramTimeline, id: string): ProgramTimeline {
  const deleted = (timeline.deletedClips || []).find((item) => item.clip.id === id);
  if (!deleted) return timeline;
  const previous = deleted.previousClipId ? timeline.clips.findIndex((clip) => clip.id === deleted.previousClipId) : -1;
  const next = deleted.nextClipId ? timeline.clips.findIndex((clip) => clip.id === deleted.nextClipId) : -1;
  const index = previous >= 0 ? previous + 1 : next >= 0 ? next : clampIndex(deleted.formerIndex, timeline.clips.length);
  return { ...timeline, clips: [...timeline.clips.slice(0, index), deleted.clip, ...timeline.clips.slice(index)], deletedClips: (timeline.deletedClips || []).filter((item) => item.clip.id !== id) };
}

export function replaceProgramClip(timeline: ProgramTimeline, id: string, clip: ProgramClip): ProgramTimeline {
  if (!timeline.clips.some((item) => item.id === id)) return timeline;
  return { ...timeline, clips: timeline.clips.map((item) => item.id === id ? { ...clip, id } : item) };
}

export function splitProgramClip(timeline: ProgramTimeline, id: string, sourceTime: number, rightId: string): ProgramTimeline {
  const index = timeline.clips.findIndex((clip) => clip.id === id);
  const clip = timeline.clips[index];
  if (!clip || sourceTime - clip.sourceStart < minimumDuration || clip.sourceEnd - sourceTime < minimumDuration) return timeline;
  const audioSplit = clip.audioSource ? clip.audioSource.sourceStart + sourceTime - clip.sourceStart : null;
  const left = { ...clip, sourceEnd: sourceTime, audioSource: clip.audioSource && audioSplit !== null ? { ...clip.audioSource, sourceEnd: audioSplit } : clip.audioSource };
  const right = { ...clip, id: rightId, sourceStart: sourceTime, audioSource: clip.audioSource && audioSplit !== null ? { ...clip.audioSource, sourceStart: audioSplit } : clip.audioSource };
  return { ...timeline, clips: [...timeline.clips.slice(0, index), left, right, ...timeline.clips.slice(index + 1)] };
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
  if (edge === "start") { const sourceStart = Math.min(value, clip.sourceEnd - minimumDuration); return { ...clip, sourceStart, audioSource: clip.audioSource ? { ...clip.audioSource, sourceStart: clip.audioSource.sourceStart + sourceStart - clip.sourceStart } : clip.audioSource }; }
  const sourceEnd = Math.max(value, clip.sourceStart + minimumDuration);
  return { ...clip, sourceEnd, audioSource: clip.audioSource ? { ...clip.audioSource, sourceEnd: clip.audioSource.sourceEnd + sourceEnd - clip.sourceEnd } : clip.audioSource };
}

function sceneClipId(sceneId: string) { return `clip.scene.${sceneId.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}`; }
function clampIndex(index: number, length: number) { return Math.max(0, Math.min(length, index)); }

const minimumDuration = 0.08;

export type SourceProgramClipInput = { id: string; sourceId: string; label: string; sourceStart: number; sourceEnd: number; createdAt: string };

import type { DeletedProgramClip, ProgramClip, ProgramTimeline, SceneProposal, VideoProject } from "./analysis-model";
import type { SourceRange } from "./editor-model";
import { selectedCutsFromScenes } from "./ProjectCutModel";
