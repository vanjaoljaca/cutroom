export function SourceBrowser({ project, open, selectedClipId, cutoutStatus, onClose, onInsert, onReplace, onCreateCutout, onCancelCutout }: SourceBrowserProps) {
  const references = project.mediaLibrary.sources.filter((source) => source.role === "reference");
  const [sourceId, setSourceId] = useState(references[0]?.id || project.mediaLibrary.primarySourceId);
  const [duration, setDuration] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [interval, setInterval] = useState<SourceInterval>({ start: 0, end: 0 });
  const [placement, setPlacement] = useState<SourcePlacement>(selectedClipId ? "after" : "end");
  const [loop, setLoop] = useState(true);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [words, setWords] = useState<SourceTranscriptWord[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = project.mediaLibrary.sources.find((candidate) => candidate.id === sourceId) || project.mediaLibrary.sources[0];
  const selectedClip = project.programTimeline.clips.find((clip) => clip.id === selectedClipId);
  const fps = source.metadata?.averageFps || 30;
  const mediaUrl = `/api/projects/${project.id}/media/${source.id}`;
  useSourceBrowserDismiss(open, onClose);
  useSourceEvidence(open, project.id, source, mediaUrl, setWaveform, setWords);
  if (!open) return null;

  function loaded() {
    const nextDuration = videoRef.current?.duration || source.metadata?.duration || 0;
    setDuration(nextDuration); setInterval(sourceSelection(project, source.id, selectedClipId, nextDuration));
  }

  function timeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    if (loop && video.currentTime >= interval.end - 0.015) video.currentTime = interval.start;
    setPlayhead(video.currentTime);
  }

  function changeSource(nextId: string) {
    setSourceId(nextId); setDuration(0); setPlayhead(0); setWaveform([]); setWords([]);
  }

  function playSelection() {
    if (!videoRef.current) return;
    videoRef.current.currentTime = interval.start; void videoRef.current.play();
  }

  function insert() {
    onInsert(source, interval.start, interval.end, placementIndex(project.programTimeline.clips, selectedClipId, placement));
  }

  function replace() {
    if (selectedClipId) onReplace(source, interval.start, interval.end, selectedClipId);
  }

  function createCutout() {
    if (selectedClipId) onCreateCutout(source, interval.start, interval.end, selectedClipId);
  }

  return <div className="source-browser-modal"><button className="source-browser-scrim" aria-label="Dismiss add media" onClick={onClose} /><section className="source-browser" role="dialog" aria-modal="true" aria-label="Add media">
    <header><div><strong>Add media</strong><span>Choose an exact source interval, then add or replace a program clip.</span></div><button aria-label="Close add media" title="Close" onClick={onClose}><X size={17} /></button></header>
    <SourceTabs project={project} sourceId={source.id} onChange={changeSource} />
    <div className="source-workspace">
      <video ref={videoRef} src={mediaUrl} controls playsInline onLoadedMetadata={loaded} onTimeUpdate={timeUpdate} />
      <div className="source-marking">
        <div className="source-time"><span>{formatPrecise(playhead)}</span><span>{formatPrecise(duration)}</span></div>
        <SourceRangeEditor duration={duration} fps={fps} interval={interval} waveform={waveform} onChange={setInterval} />
        <div className="source-selection-summary"><strong>{formatPrecise(interval.start)}–{formatPrecise(interval.end)}</strong><span>{formatPrecise(interval.end - interval.start)} selected</span></div>
        <div className="selection-playback"><button disabled={!duration} onClick={playSelection}><Play size={15} weight="fill" /> Play selection</button><label><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Loop</label></div>
        <SourceTranscript words={words} interval={interval} playhead={playhead} />
        <label>Insert<select aria-label="Insert position" value={placement} onChange={(event) => setPlacement(event.target.value as SourcePlacement)}><option value="start">At beginning</option>{selectedClipId && <option value="before">Before selected clip</option>}{selectedClipId && <option value="after">After selected clip</option>}<option value="end">At end</option></select></label>
        <div className="source-commit-actions"><button className="insert-source" disabled={interval.end - interval.start < minimumDuration} onClick={insert}><Plus size={16} weight="bold" /> Add to program</button><button disabled={!selectedClipId || interval.end - interval.start < minimumDuration} onClick={replace}>Replace selected clip</button></div>
        <button className="create-cutout" disabled={!selectedClipId || interval.end - interval.start < minimumDuration || cutoutStatus?.state === "queued" || cutoutStatus?.state === "processing"} onClick={createCutout}><PersonSimple size={16} weight="bold" /> Place subject over selected clip</button>
        {selectedClip && <p className="selected-source-clip">Selected program clip: {selectedClip.label}</p>}
        {cutoutStatus && <p className={`cutout-status ${cutoutStatus.state}`} role={cutoutStatus.state === "failed" ? "alert" : "status"}>{cutoutStatus.message}{cutoutStatus.state === "processing" ? ` · ${Math.round(cutoutStatus.progress * 100)}%` : ""}{cutoutStatus.error ? ` · ${cutoutStatus.error}` : ""}{["queued", "processing"].includes(cutoutStatus.state) && <button onClick={onCancelCutout}>Cancel</button>}</p>}
        {!references.length && <p>No referenced videos yet. Give a remote video to the Codex video task; its regenerable USB cache will appear here.</p>}
      </div>
    </div>
  </section></div>;
}

function SourceTabs({ project, sourceId, onChange }: SourceTabsProps) {
  return <div className="source-tabs" role="tablist" aria-label="Available media">{project.mediaLibrary.sources.map((source) => <button role="tab" aria-selected={source.id === sourceId} key={source.id} onClick={() => onChange(source.id)}><strong>{source.label}</strong><small>{source.role === "reference" ? "Reference" : "Recording"}</small></button>)}</div>;
}

function SourceRangeEditor({ duration, fps, interval, waveform, onChange }: SourceRangeEditorProps) {
  const step = 1 / Math.max(1, fps);
  const move = (edge: "start" | "end", value: number) => onChange(moveSourceBoundary(interval, edge, value, duration));
  const nudge = (edge: "start" | "end", frames: number) => onChange(nudgeSourceBoundary(interval, edge, frames, fps, duration));
  return <div className="source-range-editor" aria-label={`Source interval ${formatPrecise(interval.start)} to ${formatPrecise(interval.end)}`}>
    <div className="source-waveform">{waveform.map((peak, index) => <i key={index} style={{ height: `${Math.max(4, peak * 100)}%` }} />)}<span style={{ left: `${percent(interval.start, duration)}%`, width: `${percent(interval.end - interval.start, duration)}%` }} /></div>
    <input className="source-range-handle in" aria-label="Source in point" type="range" min={0} max={duration || 1} step={step} value={interval.start} onChange={(event) => move("start", Number(event.target.value))} />
    <input className="source-range-handle out" aria-label="Source out point" type="range" min={0} max={duration || 1} step={step} value={interval.end} onChange={(event) => move("end", Number(event.target.value))} />
    <div className="source-boundaries"><BoundaryField label="In" value={interval.start} onChange={(value) => move("start", value)} onNudge={(frames) => nudge("start", frames)} /><BoundaryField label="Out" value={interval.end} onChange={(value) => move("end", value)} onNudge={(frames) => nudge("end", frames)} /></div>
  </div>;
}

function BoundaryField({ label, value, onChange, onNudge }: BoundaryFieldProps) {
  return <div><label>{label}<input aria-label={`${label} time in seconds`} type="number" min={0} step="0.001" value={value.toFixed(3)} onChange={(event) => onChange(Number(event.target.value))} /></label><span><button aria-label={`Nudge ${label.toLowerCase()} backward one frame`} onClick={() => onNudge(-1)}>−1f</button><button aria-label={`Nudge ${label.toLowerCase()} forward one frame`} onClick={() => onNudge(1)}>+1f</button></span></div>;
}

function SourceTranscript({ words, interval, playhead }: SourceTranscriptProps) {
  if (!words.length) return <p className="source-transcript unavailable">No timestamped transcript for this source.</p>;
  return <div className="source-transcript" aria-label="Source transcript">{words.map((word, index) => <span key={`${word.start}.${index}`} className={`${overlaps(word, interval) ? "selected" : ""}${playhead >= word.start && playhead < word.end ? " active" : ""}`}>{word.text} </span>)}</div>;
}

function useSourceBrowserDismiss(open: boolean, onClose: () => void) {
  useEffect(() => { if (!open) return; const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", dismiss); return () => document.removeEventListener("keydown", dismiss); }, [open, onClose]);
}

function useSourceEvidence(open: boolean, projectId: string, source: VideoMediaSource, mediaUrl: string, setWaveform: Dispatch<SetStateAction<number[]>>, setWords: Dispatch<SetStateAction<SourceTranscriptWord[]>>) {
  useEffect(() => { if (!open) return; let cancelled = false; createAudioPeaks(mediaUrl, 140).then((peaks) => { if (!cancelled) setWaveform(peaks); }).catch((error) => logError("source_waveform_failed", error)); return () => { cancelled = true; }; }, [open, mediaUrl, setWaveform]);
  useEffect(() => { if (!open || !source.transcript) return void setWords([]); let cancelled = false; fetch(`/api/projects/${projectId}/media/${source.id}/transcript`).then((response) => response.ok ? response.json() : Promise.reject(new Error(`Transcript HTTP ${response.status}`))).then((input: WhisperTranscript) => { if (!cancelled) setWords(transcriptWords(input)); }).catch((error) => logError("source_transcript_failed", error)); return () => { cancelled = true; }; }, [open, projectId, source.id, source.transcript?.artifactPath, setWords]);
}

function placementIndex(clips: ProgramClip[], selectedId: string | null, placement: SourcePlacement) {
  if (placement === "start") return 0;
  if (placement === "end") return clips.length;
  const selected = clips.findIndex((clip) => clip.id === selectedId);
  if (selected < 0) return clips.length;
  return placement === "before" ? selected : selected + 1;
}

function overlaps(word: SourceTranscriptWord, interval: SourceInterval) { return word.end > interval.start && word.start < interval.end; }
function percent(value: number, duration: number) { return duration ? Math.max(0, Math.min(100, (value / duration) * 100)) : 0; }
function formatPrecise(value: number) { return `${Math.floor(value / 60)}:${(value % 60).toFixed(2).padStart(5, "0")}`; }

const minimumDuration = 0.08;

type SourcePlacement = "start" | "before" | "after" | "end";
type SourceBrowserProps = { project: VideoProject; open: boolean; selectedClipId: string | null; cutoutStatus: CutoutJobStatus | null; onClose: () => void; onInsert: (source: VideoMediaSource, start: number, end: number, index: number) => void; onReplace: (source: VideoMediaSource, start: number, end: number, clipId: string) => void; onCreateCutout: (source: VideoMediaSource, start: number, end: number, targetClipId: string) => void; onCancelCutout: () => void };
type SourceTabsProps = { project: VideoProject; sourceId: string; onChange: (sourceId: string) => void };
type SourceRangeEditorProps = { duration: number; fps: number; interval: SourceInterval; waveform: number[]; onChange: Dispatch<SetStateAction<SourceInterval>> };
type BoundaryFieldProps = { label: "In" | "Out"; value: number; onChange: (value: number) => void; onNudge: (frames: number) => void };
type SourceTranscriptProps = { words: SourceTranscriptWord[]; interval: SourceInterval; playhead: number };

import { PersonSimple, Play, Plus, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ProgramClip, VideoMediaSource, VideoProject } from "./analysis-model";
import { createAudioPeaks } from "./audio-waveform";
import type { CutoutJobStatus } from "./CutoutModel";
import { logError } from "./structured-log";
import { moveSourceBoundary, nudgeSourceBoundary, sourceSelection, transcriptWords, type SourceInterval, type SourceTranscriptWord, type WhisperTranscript } from "./SourceSelectionModel";
