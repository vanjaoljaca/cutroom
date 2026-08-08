export function PitchGraph({ artifact, mode, ranges, duration, playheadRatio, status, onSeekRatio }: PitchGraphProps) {
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const timelineDuration = mode === "cut" ? cutDuration(ranges) : duration;
  const points = artifact ? mapPitchToTimeline(artifact, mode, ranges, duration) : [];
  const domain = pitchDomain(points);
  const inspectedRatio = hoverRatio ?? playheadRatio;
  const inspected = nearestPitchPoint(points, inspectedRatio * timelineDuration);
  const paths = artifact ? pitchSegments(points, artifact.hopSize / artifact.sampleRate) : [];
  const scaleTicks = pitchScaleTicks(domain);
  const coverage = artifact ? pitchCoverage(artifact, mode, ranges, duration) : null;
  return <div className="pitch-graph" role="slider" tabIndex={0} aria-label="Pitch over time" aria-valuemin={0} aria-valuemax={Math.round(timelineDuration * 100) / 100} aria-valuenow={Math.round(inspectedRatio * timelineDuration * 100) / 100} onKeyDown={(event) => nudge(event, inspectedRatio, onSeekRatio)}>
    <div className="pitch-graph-heading"><strong>Pitch contour</strong><output>{pitchValue(inspected, status)}</output></div>
    <div className="pitch-chart-row">
      <div className="pitch-y-axis" aria-hidden="true">{scaleTicks.map((tick) => <span key={tick.midi} style={{ top: `${pitchTickY(tick.midi, domain) / 72 * 100}%` }}>{tick.note} · {Math.round(tick.hz)} Hz</span>)}</div>
      <div className="pitch-plot" onClick={(event) => seek(event, onSeekRatio)} onPointerMove={(event) => setHoverRatio(pointerRatio(event))} onPointerLeave={() => setHoverRatio(null)}>
        <svg viewBox="0 0 1000 72" preserveAspectRatio="none" aria-hidden="true">
          {scaleTicks.map((tick) => <line className="pitch-grid" key={tick.midi} x1="0" x2="1000" y1={pitchTickY(tick.midi, domain)} y2={pitchTickY(tick.midi, domain)} />)}
          {paths.map((segment, index) => <path className="pitch-line" key={`${segment[0].timelineTime}-${index}`} d={segmentPath(segment, timelineDuration, domain)} style={{ opacity: averageConfidence(segment) }} />)}
          <line className="pitch-playhead" x1={playheadRatio * 1000} x2={playheadRatio * 1000} y1="0" y2="72" />
        </svg>
        <div className="pitch-x-axis" aria-hidden="true">{pitchTimeTicks(timelineDuration).map((time) => <span key={time}>{formatPitchTime(time)}</span>)}</div>
      </div>
    </div>
    <div className="pitch-legend"><span><i />Voiced pitch</span><span>Gaps = unvoiced or below confidence</span>{coverage && <span>{Math.round(coverage.ratio * 100)}% voiced coverage</span>}</div>
  </div>;
}

function segmentPath(points: MappedPitchPoint[], duration: number, domain: PitchDomain): string {
  return points.map((point, index) => `${index ? "L" : "M"}${(point.timelineTime / duration) * 1000},${pitchY(point.hz, domain)}`).join(" ");
}

function pitchY(hz: number, domain: PitchDomain): number {
  const midi = 69 + 12 * Math.log2(hz / 440);
  return pitchTickY(midi, domain);
}

function pitchTickY(midi: number, domain: PitchDomain): number { return 68 - ((midi - domain.minimumMidi) / (domain.maximumMidi - domain.minimumMidi)) * 64; }
function formatPitchTime(time: number): string { return `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, "0")}`; }

function pitchValue(point: MappedPitchPoint | null, status: PitchStatus): string {
  if (status === "loading") return "Loading…";
  if (status === "analyzing") return "Analyzing locally…";
  if (status === "unavailable") return "Unavailable";
  if (status === "error") return "Analysis failed";
  return point ? `${Math.round(point.hz)} Hz · ${nearestNote(point.hz)}` : "No voiced pitch";
}

function seek(event: ReactMouseEvent<HTMLDivElement>, onSeekRatio: (ratio: number) => void) { onSeekRatio(pointerRatio(event)); }
function pointerRatio(event: { clientX: number; currentTarget: HTMLDivElement }): number { const bounds = event.currentTarget.getBoundingClientRect(); return Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)); }
function averageConfidence(points: MappedPitchPoint[]): number { return 0.35 + 0.65 * points.reduce((sum, point) => sum + point.confidence, 0) / points.length; }

function nudge(event: ReactKeyboardEvent<HTMLDivElement>, ratio: number, onSeekRatio: (ratio: number) => void) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const direction = event.key === "ArrowRight" ? 1 : -1;
  onSeekRatio(Math.min(1, Math.max(0, ratio + direction * (event.shiftKey ? 0.05 : 0.01))));
}

export type PitchStatus = "idle" | "loading" | "analyzing" | "unavailable" | "error";
type PitchGraphProps = { artifact: PitchArtifact | null; mode: ViewMode; ranges: SourceRange[]; duration: number; playheadRatio: number; status: PitchStatus; onSeekRatio: (ratio: number) => void };

import { useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { cutDuration, type SourceRange, type ViewMode } from "./editor-model";
import { mapPitchToTimeline, nearestPitchPoint, pitchCoverage, pitchDomain, pitchScaleTicks, pitchSegments, pitchTimeTicks, type MappedPitchPoint, type PitchDomain } from "./PitchGraphModel";
import type { PitchArtifact } from "./PitchModel";
import { nearestNote } from "./PitchModel";
