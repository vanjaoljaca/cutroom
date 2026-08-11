export function sourceSelection(project: VideoProject, sourceId: string, selectedClipId: string | null, duration: number): SourceInterval {
  const clip = project.programTimeline.clips.find((item) => item.id === selectedClipId && item.sourceId === sourceId);
  return clip ? { start: clip.sourceStart, end: clip.sourceEnd } : { start: 0, end: Math.min(defaultDuration, duration) };
}

export function moveSourceBoundary(interval: SourceInterval, edge: "start" | "end", value: number, duration: number): SourceInterval {
  if (edge === "start") return { ...interval, start: clamp(value, 0, interval.end - minimumDuration) };
  return { ...interval, end: clamp(value, interval.start + minimumDuration, duration) };
}

export function nudgeSourceBoundary(interval: SourceInterval, edge: "start" | "end", frames: number, fps: number, duration: number) {
  return moveSourceBoundary(interval, edge, interval[edge] + frames / Math.max(1, fps), duration);
}

export function transcriptWords(input: WhisperTranscript): SourceTranscriptWord[] {
  return input.segments.flatMap((segment) => segment.words || []).map((word) => ({ text: word.word.trim(), start: word.start, end: word.end, confidence: word.probability ?? 1 })).filter((word) => word.text && word.end > word.start);
}

function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }

const defaultDuration = 5;
const minimumDuration = 0.08;

export type SourceInterval = { start: number; end: number };
export type SourceTranscriptWord = { text: string; start: number; end: number; confidence: number };
export type WhisperTranscript = { text?: string; language?: string; segments: Array<{ words?: Array<{ word: string; start: number; end: number; probability?: number }> }> };

import type { VideoProject } from "./analysis-model";
