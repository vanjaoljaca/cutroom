export function emptySubtitleTrack(): SubtitleTrack {
  return { version: 1, visible: true, style: defaultSubtitleStyle(), cues: [], deletedCues: [] };
}

export function defaultSubtitleStyle(): SubtitleStyle {
  return { fontFamily: "tiktok-sans", fontSize: 58, fontWeight: 700, color: "#ffffff", backgroundColor: null, strokeColor: "#000000", strokeWidth: 4, shadow: true, align: "center", anchor: "bottom", x: 0.5, y: 0.82, maxWidth: 0.86, safeZone: true, layer: 40, opacity: 1 };
}

export function normalizeSubtitleTrack(project: VideoProject): { textOverlays: TextOverlay[]; subtitleTrack: SubtitleTrack } {
  const legacy = (project.textOverlays || []).filter((overlay) => overlay.role === "caption");
  const existing = project.subtitleTrack || emptySubtitleTrack();
  const migrated = legacy.map((overlay) => legacyCaptionCue(project, overlay)).filter((cue): cue is SubtitleCue => Boolean(cue)).filter((cue) => !existing.cues.some((item) => item.id === cue.id));
  return { textOverlays: (project.textOverlays || []).filter((overlay) => overlay.role !== "caption"), subtitleTrack: { ...emptySubtitleTrack(), ...existing, style: { ...defaultSubtitleStyle(), ...existing.style }, cues: [...existing.cues, ...migrated], deletedCues: existing.deletedCues || [] } };
}

export function subtitleIntervals(project: VideoProject): SubtitleInterval[] {
  if (!project.subtitleTrack.visible) return [];
  return project.subtitleTrack.cues.map((cue) => ({ cue, start: cue.target.start, end: cue.target.end })).sort((left, right) => left.start - right.start);
}

export function subtitleAsTextOverlay(project: VideoProject, cue: SubtitleCue): TextOverlay {
  const style = project.subtitleTrack.style;
  return { id: cue.id, kind: "text", role: "caption", text: cue.text, target: cue.target, layout: { anchor: style.anchor, x: style.x, y: style.y, maxWidth: style.maxWidth, safeZone: style.safeZone }, style, layer: style.layer, opacity: style.opacity, enabled: project.subtitleTrack.visible, provenance: { sourceId: cue.provenance.sourceId, attribution: "cutroom:subtitle-cue-v1" }, createdAt: cue.createdAt };
}

export function generateSubtitleCues(project: VideoProject, wordsBySource: Record<string, WordTiming[]>, now = new Date().toISOString()): SubtitleCue[] {
  let programStart = 0;
  return project.programTimeline.clips.flatMap((clip) => {
    const words = (wordsBySource[clip.sourceId] || []).filter((word) => midpoint(word) >= clip.sourceStart && midpoint(word) < clip.sourceEnd);
    const cues = groupWords(words).map((group) => cueFromWords(clip, group, programStart, now));
    programStart += clip.sourceEnd - clip.sourceStart;
    return cues;
  });
}

export function updateSubtitleCue(track: SubtitleTrack, cue: SubtitleCue): SubtitleTrack {
  return { ...track, cues: track.cues.map((item) => item.id === cue.id ? cue : item) };
}

export function deleteSubtitleCue(track: SubtitleTrack, id: string, deletedAt = new Date().toISOString()): SubtitleTrack {
  const index = track.cues.findIndex((cue) => cue.id === id); if (index < 0) return track;
  return { ...track, cues: track.cues.filter((cue) => cue.id !== id), deletedCues: [...track.deletedCues, { cue: track.cues[index], formerIndex: index, deletedAt }] };
}

export function restoreSubtitleCue(track: SubtitleTrack, id: string): SubtitleTrack {
  const deleted = track.deletedCues.find((item) => item.cue.id === id); if (!deleted) return track;
  const cues = [...track.cues]; cues.splice(Math.min(deleted.formerIndex, cues.length), 0, deleted.cue);
  return { ...track, cues, deletedCues: track.deletedCues.filter((item) => item.cue.id !== id) };
}

export function splitSubtitleCue(track: SubtitleTrack, id: string, at: number): SubtitleTrack {
  const index = track.cues.findIndex((cue) => cue.id === id); const cue = track.cues[index];
  if (!cue || at <= cue.target.start + 0.04 || at >= cue.target.end - 0.04) return track;
  const sourceAt = cue.provenance.sourceStart + ((at - cue.target.start) / (cue.target.end - cue.target.start)) * (cue.provenance.sourceEnd - cue.provenance.sourceStart);
  const [leftText, rightText] = splitText(cue.text); const createdAt = new Date().toISOString();
  const left = { ...cue, text: leftText, target: { ...cue.target, end: at }, provenance: { ...cue.provenance, sourceEnd: sourceAt } };
  const right = { ...cue, id: `subtitle.${crypto.randomUUID().toLowerCase()}`, text: rightText, target: { ...cue.target, start: at }, provenance: { ...cue.provenance, sourceStart: sourceAt }, createdAt };
  return { ...track, cues: [...track.cues.slice(0, index), left, right, ...track.cues.slice(index + 1)] };
}

function legacyCaptionCue(project: VideoProject, overlay: TextOverlay): SubtitleCue | null {
  const interval = textOverlayProgramInterval(overlay, programRanges(project)); if (!interval) return null;
  const target = { type: "selected-cut" as const, start: interval.start, end: interval.end };
  const sourceId = overlay.provenance.sourceId || (overlay.target.type === "program-clip" ? overlay.target.sourceId : "media.primary");
  const sourceStart = overlay.target.type === "program-clip" ? overlay.target.sourceStart : target.start;
  const sourceEnd = overlay.target.type === "program-clip" ? overlay.target.sourceEnd : target.end;
  return { id: overlay.id.replace(/^text\./, "subtitle."), text: overlay.text, target, provenance: { sourceId, clipId: overlay.target.type === "program-clip" ? overlay.target.clipId : "clip.legacy", sourceStart, sourceEnd, wordStart: 0, wordEnd: 0 }, createdAt: overlay.createdAt };
}

function cueFromWords(clip: ProgramClip, words: WordTiming[], programStart: number, createdAt: string): SubtitleCue {
  const sourceStart = Math.max(clip.sourceStart, words[0].startTime); const sourceEnd = Math.min(clip.sourceEnd, words.at(-1)!.endTime + 0.06);
  return { id: `subtitle.${crypto.randomUUID().toLowerCase()}`, text: words.map((word) => word.word).join(" "), target: { type: "selected-cut", start: programStart + sourceStart - clip.sourceStart, end: programStart + sourceEnd - clip.sourceStart }, provenance: { sourceId: clip.sourceId, clipId: clip.id, sourceStart, sourceEnd, wordStart: words[0].startTime, wordEnd: words.at(-1)!.endTime }, createdAt };
}

function groupWords(words: WordTiming[]): WordTiming[][] {
  const groups: WordTiming[][] = [];
  words.forEach((word) => { const current = groups.at(-1); if (!current || current.length >= 7 || word.endTime - current[0].startTime > 2.5 || /[.!?]$/.test(current.at(-1)!.word)) groups.push([word]); else current.push(word); });
  return groups;
}

function splitText(text: string): [string, string] { const words = text.split(/\s+/); const at = Math.max(1, Math.floor(words.length / 2)); return [words.slice(0, at).join(" "), words.slice(at).join(" ") || words.at(-1)!]; }
function midpoint(word: WordTiming) { return (word.startTime + word.endTime) / 2; }

export type SubtitleInterval = { cue: SubtitleCue; start: number; end: number };

import type { ProgramClip, SubtitleCue, SubtitleStyle, SubtitleTrack, TextOverlay, VideoProject, WordTiming } from "./analysis-model";
import { programRanges } from "./ProgramTimelineModel";
import { textOverlayProgramInterval } from "./TextOverlayModel";
