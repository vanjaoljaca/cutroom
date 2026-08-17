export function activeProgramAudio(project: VideoProject | null, ranges: SourceRange[], rangeIndex: number, sourceTime: number): ActiveProgramAudio | null {
  const range = ranges[rangeIndex];
  const clip = project?.programTimeline.clips.find((candidate) => candidate.id === range?.clipId);
  const audio = clip?.audioSource;
  if (!range || !clip || !audio) return null;
  return { ...audio, clipId: clip.id, time: audio.sourceStart + clamp(sourceTime - range.start, 0, range.end - range.start) };
}

export async function synchronizeProgramAudio(element: HTMLAudioElement | null, active: ActiveProgramAudio | null, playing: boolean, globallyMuted: boolean) {
  if (!element || !active) return element?.pause();
  element.volume = active.volume;
  element.muted = globallyMuted || active.muted;
  if (Math.abs(element.currentTime - active.time) > 0.12) element.currentTime = active.time;
  if (playing && element.paused) await element.play().catch(() => undefined);
  if (!playing && !element.paused) element.pause();
}

function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }

export type ActiveProgramAudio = ProgramAudioSource & { clipId: string; time: number };

import type { ProgramAudioSource, VideoProject } from "./analysis-model";
import type { SourceRange } from "./editor-model";
