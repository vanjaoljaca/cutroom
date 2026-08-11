export function countProgramScenesAndTakes(project: VideoProject): ProgramSceneTakeCount {
  const sceneIds = new Set(project.programTimeline.clips.flatMap((clip) => clip.sceneId ? [clip.sceneId] : []));
  const scenes = project.scenes.filter((scene) => sceneIds.has(scene.id));
  return { scenes: sceneIds.size, takes: scenes.reduce((total, scene) => total + scene.takes.length, 0) };
}

export function recordingProgramSegments(project: VideoProject): RecordingProgramSegment[] {
  let programStart = 0;
  return programRanges(project).map((range) => {
    const duration = range.end - range.start;
    const segment = { ...range, programStart, programEnd: programStart + duration };
    programStart = segment.programEnd;
    return segment;
  });
}

export function recordingSegmentActivationKey(key: string, repeat = false) {
  return !repeat && (key === "Enter" || key === " ");
}

export function selectProgramTake(project: VideoProject, clipId: string, takeId: string): VideoProject {
  const clip = requiredClip(project, clipId);
  const scene = requiredScene(project, clip.sceneId);
  const take = requiredTake(scene, takeId);
  const selectedScene = { ...scene, takes: scene.takes.map((item) => ({ ...item, selected: item.id === take.id })) };
  const scenes = project.scenes.map((item) => item.id === scene.id ? selectedScene : item);
  return { ...project, scenes, cuts: selectedCutsFromScenes(scenes), programTimeline: syncSceneClip(project.programTimeline, selectedScene) };
}

function requiredClip(project: VideoProject, clipId: string) {
  const clip = project.programTimeline.clips.find((item) => item.id === clipId);
  if (!clip) throw new Error(`Unknown program clip: ${clipId}`);
  return clip;
}

function requiredScene(project: VideoProject, sceneId: string | null) {
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new Error(`Program clip has no selectable scene: ${sceneId || "none"}`);
  return scene;
}

function requiredTake(scene: SceneProposal, takeId: string) {
  const take = scene.takes.find((item) => item.id === takeId);
  if (!take) throw new Error(`Unknown take ${takeId} for scene ${scene.id}`);
  return take;
}

export type ProgramSceneTakeCount = { scenes: number; takes: number };
export type RecordingProgramSegment = SourceRange & { programStart: number; programEnd: number };

import type { SceneProposal, VideoProject } from "./analysis-model";
import type { SourceRange } from "./editor-model";
import { selectedCutsFromScenes } from "./ProjectCutModel";
import { programRanges, syncSceneClip } from "./ProgramTimelineModel";
