export function mapPitchToTimeline(artifact: PitchArtifact, mode: ViewMode, ranges: SourceRange[], duration: number): MappedPitchPoint[] {
  const voiced = artifact.points.filter((point): point is VoicedPitchPoint => point.hz !== null && point.confidence >= artifact.confidenceThreshold);
  if (mode === "original") return voiced.map((point) => ({ ...point, sourceTime: point.time, timelineTime: point.time, rangeIndex: 0 }));
  return ranges.flatMap((range, rangeIndex) => mapRange(voiced, range, rangeIndex, cutDuration(ranges.slice(0, rangeIndex))));
}

export function pitchSegments(points: MappedPitchPoint[], hopSeconds: number): MappedPitchPoint[][] {
  const segments: MappedPitchPoint[][] = [];
  points.forEach((point) => {
    const segment = segments.at(-1);
    const previous = segment?.at(-1);
    if (!segment || !previous || point.rangeIndex !== previous.rangeIndex || point.sourceTime - previous.sourceTime > hopSeconds * 1.75) segments.push([point]);
    else segment.push(point);
  });
  return segments.filter((segment) => segment.length > 1);
}

export function pitchDomain(points: MappedPitchPoint[]): PitchDomain {
  const midi = points.map((point) => 69 + 12 * Math.log2(point.hz / 440)).sort((left, right) => left - right);
  if (!midi.length) return { minimumMidi: 36, maximumMidi: 72 };
  const low = midi[Math.floor(midi.length * 0.05)] - 2;
  const high = midi[Math.floor(midi.length * 0.95)] + 2;
  const center = (low + high) / 2;
  const span = Math.max(24, high - low);
  return { minimumMidi: center - span / 2, maximumMidi: center + span / 2 };
}

export function nearestPitchPoint(points: MappedPitchPoint[], timelineTime: number): MappedPitchPoint | null {
  return points.reduce<MappedPitchPoint | null>((nearest, point) => !nearest || Math.abs(point.timelineTime - timelineTime) < Math.abs(nearest.timelineTime - timelineTime) ? point : nearest, null);
}

export function pitchCoverage(artifact: PitchArtifact, mode: ViewMode, ranges: SourceRange[], duration: number): PitchCoverage {
  const included = artifact.points.filter((point) => mode === "original" ? point.time <= duration : ranges.some((range) => point.time >= range.start && point.time <= range.end));
  const voiced = included.filter((point) => point.hz !== null && point.confidence >= artifact.confidenceThreshold).length;
  return { voiced, total: included.length, ratio: included.length ? voiced / included.length : 0 };
}

export function pitchScaleTicks(domain: PitchDomain): PitchScaleTick[] {
  const first = Math.ceil(domain.minimumMidi / 12) * 12;
  const ticks: PitchScaleTick[] = [];
  for (let midi = first; midi <= domain.maximumMidi; midi += 12) ticks.push({ midi, note: `C${Math.floor(midi / 12) - 1}`, hz: 440 * 2 ** ((midi - 69) / 12) });
  return ticks;
}

export function pitchTimeTicks(duration: number): number[] {
  if (!duration) return [0];
  return Array.from({ length: 5 }, (_, index) => duration * index / 4);
}

function mapRange(points: VoicedPitchPoint[], range: SourceRange, rangeIndex: number, before: number): MappedPitchPoint[] {
  return points.filter((point) => point.time >= range.start && point.time <= range.end).map((point) => ({ ...point, sourceTime: point.time, timelineTime: before + point.time - range.start, rangeIndex }));
}

export type MappedPitchPoint = { sourceTime: number; timelineTime: number; rangeIndex: number; hz: number; confidence: number };
export type PitchDomain = { minimumMidi: number; maximumMidi: number };
export type PitchCoverage = { voiced: number; total: number; ratio: number };
export type PitchScaleTick = { midi: number; note: string; hz: number };
type VoicedPitchPoint = PitchPoint & { hz: number };

import type { PitchArtifact, PitchPoint } from "./PitchModel";
import { cutDuration, type SourceRange, type ViewMode } from "./editor-model";
