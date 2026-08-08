export function SourceBrowser({ project, open, selectedClipId, cutoutStatus, onClose, onInsert, onCreateCutout }: SourceBrowserProps) {
  const references = project.mediaLibrary.sources.filter((source) => source.role === "reference");
  const [sourceId, setSourceId] = useState(references[0]?.id || project.mediaLibrary.primarySourceId);
  const [duration, setDuration] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [markIn, setMarkIn] = useState(0);
  const [markOut, setMarkOut] = useState(0);
  const [placement, setPlacement] = useState<SourcePlacement>(selectedClipId ? "after" : "end");
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = project.mediaLibrary.sources.find((candidate) => candidate.id === sourceId) || project.mediaLibrary.sources[0];
  if (!open) return null;

  function loaded() {
    const nextDuration = videoRef.current?.duration || source.metadata?.duration || 0;
    setDuration(nextDuration);
    setMarkIn(0);
    setMarkOut(Math.min(5, nextDuration));
  }

  function changeSource(nextId: string) {
    setSourceId(nextId);
    setDuration(0);
    setPlayhead(0);
  }

  function insert() {
    const index = placementIndex(project.programTimeline.clips, selectedClipId, placement);
    onInsert(source, markIn, markOut, index);
  }

  function createCutout() {
    if (selectedClipId) onCreateCutout(source, markIn, markOut, selectedClipId);
  }

  return <section className="source-browser" aria-label="Media sources">
    <header><div><strong>Sources</strong><span>Mark a section, then insert it into the movie.</span></div><button aria-label="Close sources" title="Close sources" onClick={onClose}><X size={17} /></button></header>
    <div className="source-tabs" role="tablist" aria-label="Available media sources">{project.mediaLibrary.sources.map((candidate) => <button role="tab" aria-selected={candidate.id === source.id} key={candidate.id} onClick={() => changeSource(candidate.id)}><strong>{candidate.label}</strong><small>{candidate.role === "reference" ? "Reference" : "Recording"}</small></button>)}</div>
    <div className="source-workspace">
      <video ref={videoRef} src={`/api/projects/${project.id}/media/${source.id}`} controls playsInline onLoadedMetadata={loaded} onTimeUpdate={() => setPlayhead(videoRef.current?.currentTime || 0)} />
      <div className="source-marking">
        <div className="source-time"><span>{formatPrecise(playhead)}</span><span>{formatPrecise(duration)}</span></div>
        <div className="source-range" aria-label={`Marked source interval ${formatPrecise(markIn)} to ${formatPrecise(markOut)}`}><span style={{ left: `${percent(markIn, duration)}%`, width: `${percent(markOut - markIn, duration)}%` }} /></div>
        <div className="mark-actions"><button disabled={!duration} onClick={() => setMarkIn(Math.max(0, Math.min(playhead, markOut - minimumDuration)))}>Set in <b>{formatPrecise(markIn)}</b></button><button disabled={!duration} onClick={() => setMarkOut(Math.min(duration, Math.max(playhead, markIn + minimumDuration)))}>Set out <b>{formatPrecise(markOut)}</b></button></div>
        <label>Insert<select aria-label="Insert position" value={placement} onChange={(event) => setPlacement(event.target.value as SourcePlacement)}><option value="start">At beginning</option>{selectedClipId && <option value="before">Before selected clip</option>}{selectedClipId && <option value="after">After selected clip</option>}<option value="end">At end</option></select></label>
        <button className="insert-source" disabled={markOut - markIn < minimumDuration} onClick={insert}><Plus size={16} weight="bold" /> Insert {formatPrecise(markOut - markIn)} into movie</button>
        <button className="create-cutout" disabled={!selectedClipId || markOut - markIn < minimumDuration || cutoutStatus?.state === "queued" || cutoutStatus?.state === "processing"} onClick={createCutout}><PersonSimple size={16} weight="bold" /> Place me over selected clip</button>
        {cutoutStatus && <p className={`cutout-status ${cutoutStatus.state}`} role={cutoutStatus.state === "failed" ? "alert" : "status"}>{cutoutStatus.message}{cutoutStatus.state === "processing" ? ` · ${Math.round(cutoutStatus.progress * 100)}%` : ""}{cutoutStatus.error ? ` · ${cutoutStatus.error}` : ""}</p>}
        {!references.length && <p>No referenced videos yet. Give a video URL to the Codex video task; it will appear here after it is cached on USB.</p>}
      </div>
    </div>
  </section>;
}

function placementIndex(clips: ProgramClip[], selectedId: string | null, placement: SourcePlacement) {
  if (placement === "start") return 0;
  if (placement === "end") return clips.length;
  const selected = clips.findIndex((clip) => clip.id === selectedId);
  if (selected < 0) return clips.length;
  return placement === "before" ? selected : selected + 1;
}

function percent(value: number, duration: number) { return duration ? Math.max(0, Math.min(100, (value / duration) * 100)) : 0; }
function formatPrecise(value: number) { return `${Math.floor(value / 60)}:${(value % 60).toFixed(2).padStart(5, "0")}`; }

const minimumDuration = 0.08;

type SourcePlacement = "start" | "before" | "after" | "end";
type SourceBrowserProps = { project: VideoProject; open: boolean; selectedClipId: string | null; cutoutStatus: CutoutJobStatus | null; onClose: () => void; onInsert: (source: VideoMediaSource, start: number, end: number, index: number) => void; onCreateCutout: (source: VideoMediaSource, start: number, end: number, targetClipId: string) => void };

import { PersonSimple, Plus, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { ProgramClip, VideoMediaSource, VideoProject } from "./analysis-model";
import type { CutoutJobStatus } from "./CutoutModel";
