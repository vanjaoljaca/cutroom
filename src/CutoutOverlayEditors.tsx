export function CutoutOverlayStage({ project, mode, cutTime, playing, selectedId, onSelect, onLayoutChange, onCropChange, onAudioChange }: CutoutOverlayStageProps) {
  const ranges = programRanges(project);
  const ready = cutoutProgramIntervals(project, ranges).filter((interval) => interval.overlay.processing.status === "ready");
  const loaded = loadedCutoutIntervals(ready, mode, cutTime, selectedId);
  return <div className="overlay-stage cutout-stage" aria-label="Subject cutouts">{loaded.map((interval) => (
    <EditableCutout key={interval.overlay.id} project={project} interval={interval} cutTime={cutTime} playing={playing} visible={mode === "cut" && cutTime >= interval.start && cutTime <= interval.end} selected={selectedId === interval.overlay.id} onSelect={onSelect} onChange={onLayoutChange} onCropChange={onCropChange} onAudioChange={onAudioChange} />
  ))}</div>;
}

export function CutoutOverlayTracks({ project, ranges, playhead, selectedId, onSelect, onTimingChange }: CutoutOverlayTracksProps) {
  const duration = cutDuration(ranges);
  const intervals = cutoutProgramIntervals(project, ranges);
  if (!intervals.length) return null;
  const tracks = groupedSubjectIntervals(intervals);
  return <>{[...tracks].map(([trackId, segments]) => { const order = compositingLaneOrder(segments[0].overlay.layer); const label = subjectTrackLabel(segments.map(({ overlay }) => overlay)); return <Fragment key={trackId}><div className="timeline-track-label cutout-track-label" style={{ order }}>{label}</div><div className="cutout-tracks timeline-track-content" data-overlay-editor aria-label={`Subject ${label}`} style={{ order }}>{segments.map((interval) => <CutoutTimingClip key={interval.overlay.id} interval={interval} duration={duration} selected={selectedId === interval.overlay.id} onSelect={onSelect} onChange={onTimingChange} />)}<span className="track-playhead" aria-hidden="true" style={{ left: playhead }} /></div></Fragment>; })}</>;
}

function EditableCutout({ project, interval, cutTime, playing, visible, selected, onSelect, onChange, onCropChange, onAudioChange }: EditableCutoutProps) {
  const drag = useRef<LayoutDrag | null>(null);
  const cropDrag = useRef<CropDrag | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [sourceRatio, setSourceRatio] = useState(9 / 16);
  useEffect(() => { void synchronizeOverlayPlayback(videoRef.current, cutTime - interval.start, visible, playing); }, [cutTime, interval.start, playing, visible]);
  function begin(event: ReactPointerEvent<HTMLElement>, mode: LayoutDragMode) {
    event.stopPropagation();
    const bounds = event.currentTarget.closest(".overlay-stage")?.getBoundingClientRect();
    const overlayBounds = event.currentTarget.closest(".cutout-overlay-item")?.getBoundingClientRect();
    if (!bounds || !overlayBounds) return;
    drag.current = { mode, clientX: event.clientX, clientY: event.clientY, width: bounds.width, height: bounds.height, x: interval.overlay.layout.x, y: interval.overlay.layout.y, overlayWidth: interval.overlay.layout.width, overlayHeight: interval.overlay.layout.height, pixelWidth: overlayBounds.width, pixelHeight: overlayBounds.height };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(interval.overlay.id);
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    event.stopPropagation();
    onChange(interval.overlay.id, changedLayout(interval.overlay.layout, drag.current, event.clientX, event.clientY), false);
  }
  function finish(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation();
    if (drag.current) onChange(interval.overlay.id, changedLayout(interval.overlay.layout, drag.current, event.clientX, event.clientY), true);
    drag.current = null;
  }
  function beginCrop(event: ReactPointerEvent<HTMLButtonElement>, edge: CropEdge) {
    event.stopPropagation();
    const bounds = event.currentTarget.closest(".cutout-overlay-item")?.getBoundingClientRect();
    if (!bounds) return;
    cropDrag.current = { edge, clientX: event.clientX, clientY: event.clientY, fullWidth: bounds.width / (1 - interval.overlay.crop.left - interval.overlay.crop.right), fullHeight: bounds.height / (1 - interval.overlay.crop.top - interval.overlay.crop.bottom), crop: interval.overlay.crop };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveCrop(event: ReactPointerEvent<HTMLButtonElement>, commit = false) {
    if (!cropDrag.current) return;
    event.stopPropagation();
    onCropChange(interval.overlay.id, draggedCrop(cropDrag.current, event.clientX, event.clientY), commit);
    if (commit) cropDrag.current = null;
  }
  const overlay = interval.overlay;
  const style = { ...overlayFrameStyle(overlay.layout, overlay.opacity, overlay.layer, visible), aspectRatio: croppedAspectRatio(sourceRatio, 1, overlay.crop) };
  const videoStyle = croppedVideoStyle(overlay.crop);
  const audio = project.programTimeline.clips.find((clip) => clip.id === overlay.target.clipId)?.audioSource || null;
  return <div className={`cutout-overlay-item ${selected ? "selected" : ""}`} data-overlay-editor aria-hidden={!visible} style={style}><button className="overlay-move-surface cutout-viewport" tabIndex={visible ? 0 : -1} aria-label={`Move ${overlay.label} on video`} onClick={() => onSelect(overlay.id)} onDoubleClick={() => { onSelect(overlay.id); setInspectorOpen(true); }} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={finish}><video ref={videoRef} muted playsInline preload={visible ? "auto" : "metadata"} style={videoStyle} onLoadedMetadata={(event) => setSourceRatio(event.currentTarget.videoWidth / event.currentTarget.videoHeight)} src={`/api/projects/${project.id}/cutouts/${overlay.id}/preview`} /></button><button className="overlay-resize-handle" aria-label={`Resize ${overlay.label}`} onPointerDown={(event) => begin(event, "resize")} onPointerMove={move} onPointerUp={finish} />{selected && inspectorOpen && <>{cropEdges.map((edge) => <button key={edge} className={`cutout-crop-handle ${edge}`} aria-label={`Crop ${edge} of ${subjectTrackLabel([overlay])}`} onPointerDown={(event) => beginCrop(event, edge)} onPointerMove={moveCrop} onPointerUp={(event) => moveCrop(event, true)} />)}<CutoutCropInspector overlay={overlay} audio={audio} onChange={onCropChange} onAudioChange={onAudioChange} onClose={() => setInspectorOpen(false)} /></>}</div>;
}

export function loadedCutoutIntervals(intervals: CutoutProgramInterval[], mode: ViewMode, cutTime: number, selectedId: string | null) {
  if (mode !== "cut") return [];
  const active = intervals.findIndex((interval) => cutTime >= interval.start && cutTime <= interval.end);
  const upcoming = intervals.findIndex((interval) => interval.start > cutTime);
  return intervals.filter((interval, index) => index === active || index === upcoming || interval.overlay.id === selectedId);
}

function CutoutCropInspector({ overlay, audio, onChange, onAudioChange, onClose }: CropInspectorProps) {
  return <section className="cutout-crop-control" aria-label={`Edit ${subjectTrackLabel([overlay])}`}><header><strong>{subjectTrackLabel([overlay])}</strong><button onClick={() => onChange(overlay.id, zeroCrop, true)}>Reset crop</button><button aria-label="Close subject editor" onClick={onClose}>×</button></header>{cropEdges.map((edge) => <label key={edge}><span>{edge}</span><input aria-label={`${edge} crop slider`} type="range" min="0" max={Math.floor(cropMaximum(overlay.crop, edge) * 100)} value={Math.round(overlay.crop[edge] * 100)} onChange={(event) => changeCropEdge(overlay, edge, event.currentTarget.value, onChange)} /><input aria-label={`${edge} crop percentage`} type="number" min="0" max={Math.floor(cropMaximum(overlay.crop, edge) * 100)} value={Math.round(overlay.crop[edge] * 100)} onChange={(event) => changeCropEdge(overlay, edge, event.currentTarget.value, onChange)} /><output>%</output></label>)}{audio && <><label><span>Voice</span><input aria-label="Subject voice volume" type="range" min="0" max="200" value={Math.round(audio.volume * 100)} onChange={(event) => onAudioChange(overlay.subjectTrackId!, Number(event.currentTarget.value) / 100, audio.muted)} /><output>{Math.round(audio.volume * 100)}%</output></label><label><span>Mute voice</span><input aria-label="Mute subject voice" type="checkbox" checked={audio.muted} onChange={(event) => onAudioChange(overlay.subjectTrackId!, audio.volume, event.currentTarget.checked)} /></label></>}</section>;
}

function changeCropEdge(overlay: CutoutProgramInterval["overlay"], edge: CropEdge, value: string, onChange: CropChange) { onChange(overlay.id, { ...overlay.crop, [edge]: Number(value) / 100 }, true); }

function draggedCrop(drag: CropDrag, clientX: number, clientY: number): CutoutCrop {
  const deltaX = (clientX - drag.clientX) / drag.fullWidth;
  const deltaY = (clientY - drag.clientY) / drag.fullHeight;
  if (drag.edge === "top") return { ...drag.crop, top: clamp(drag.crop.top + deltaY, 0, 0.98 - drag.crop.bottom) };
  if (drag.edge === "bottom") return { ...drag.crop, bottom: clamp(drag.crop.bottom - deltaY, 0, 0.98 - drag.crop.top) };
  if (drag.edge === "left") return { ...drag.crop, left: clamp(drag.crop.left + deltaX, 0, 0.98 - drag.crop.right) };
  return { ...drag.crop, right: clamp(drag.crop.right - deltaX, 0, 0.98 - drag.crop.left) };
}

function cropMaximum(crop: CutoutCrop, edge: CropEdge) { return 0.98 - crop[edge === "top" ? "bottom" : edge === "bottom" ? "top" : edge === "left" ? "right" : "left"]; }

function croppedVideoStyle(crop: CutoutCrop): CSSProperties {
  const width = 1 - crop.left - crop.right;
  const height = 1 - crop.top - crop.bottom;
  return { position: "absolute", width: `${100 / width}%`, height: `${100 / height}%`, left: `${(-crop.left / width) * 100}%`, top: `${(-crop.top / height) * 100}%`, objectFit: "fill" };
}

function CutoutTimingClip({ interval, duration, selected, onSelect, onChange }: CutoutTimingClipProps) {
  const drag = useRef<TimingDrag | null>(null);
  function begin(event: ReactPointerEvent<HTMLElement>, mode: TimingDragMode) {
    event.stopPropagation();
    const bounds = event.currentTarget.closest(".cutout-tracks")?.getBoundingClientRect();
    if (!bounds) return;
    drag.current = { mode, left: bounds.left, width: bounds.width, pointer: ((event.clientX - bounds.left) / bounds.width) * duration, start: interval.start, end: interval.end };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(interval.overlay.id, interval.start);
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    event.stopPropagation();
    const delta = ((event.clientX - drag.current.left) / drag.current.width) * duration - drag.current.pointer;
    const next = movedInterval(drag.current, delta, interval, duration);
    onChange(interval.overlay.id, next.start, next.end, false);
  }
  function finish(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    const delta = ((event.clientX - drag.current.left) / drag.current.width) * duration - drag.current.pointer;
    const next = movedInterval(drag.current, delta, interval, duration);
    drag.current = null;
    onChange(interval.overlay.id, next.start, next.end, true);
  }
  const style = { left: `${(interval.start / duration) * 100}%`, width: `${((interval.end - interval.start) / duration) * 100}%` };
  return <span className={`cutout-clip ${selected ? "selected" : ""} ${interval.overlay.processing.status}`} style={style}><button className="cutout-move-handle" onClick={() => onSelect(interval.overlay.id, interval.start)} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={finish}>{interval.overlay.processing.status === "ready" ? interval.overlay.label : interval.overlay.processing.status}</button><button className="overlay-time-handle start" aria-label={`Adjust start of ${interval.overlay.label}`} onPointerDown={(event) => begin(event, "start")} onPointerMove={move} onPointerUp={finish} /><button className="overlay-time-handle end" aria-label={`Adjust end of ${interval.overlay.label}`} onPointerDown={(event) => begin(event, "end")} onPointerMove={move} onPointerUp={finish} /></span>;
}

function movedInterval(drag: TimingDrag, delta: number, interval: CutoutProgramInterval, duration: number) {
  const sourceDuration = interval.overlay.sourceEnd - interval.overlay.sourceStart;
  if (drag.mode === "start") return { start: clamp(drag.start + delta, Math.max(interval.hostStart, drag.end - sourceDuration), drag.end - minimumDuration), end: drag.end };
  if (drag.mode === "end") return { start: drag.start, end: clamp(drag.end + delta, drag.start + minimumDuration, Math.min(duration, interval.hostEnd, drag.start + sourceDuration)) };
  const length = drag.end - drag.start;
  const start = clamp(drag.start + delta, interval.hostStart, Math.min(duration, interval.hostEnd) - length);
  return { start, end: start + length };
}

function changedLayout(layout: OverlayLayout, drag: LayoutDrag, clientX: number, clientY: number): OverlayLayout {
  const deltaX = (clientX - drag.clientX) / drag.width;
  const deltaY = (clientY - drag.clientY) / drag.height;
  if (drag.mode === "resize") return { ...layout, ...proportionalOverlaySize({ clientX: drag.clientX, clientY: drag.clientY, pixelWidth: drag.pixelWidth, pixelHeight: drag.pixelHeight, width: drag.overlayWidth, height: drag.overlayHeight }, clientX, clientY) };
  return { ...layout, x: clamp(drag.x + deltaX, 0, 1), y: clamp(drag.y + deltaY, 0, 1), placementIntent: "explicit" };
}

function overlayFrameStyle(layout: OverlayLayout, opacity: number, layer: number, visible: boolean): CSSProperties {
  return { left: `${layout.x * 100}%`, top: `${layout.y * 100}%`, width: `${layout.width * 100}%`, height: layout.height === null ? "auto" : `${layout.height * 100}%`, opacity, visibility: visible ? "visible" : "hidden", zIndex: 10 + layer, transform: anchorTransform[layout.anchor] };
}

function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }

const minimumDuration = 0.08;
const cropEdges = ["top", "right", "bottom", "left"] as const;
const zeroCrop: CutoutCrop = { top: 0, right: 0, bottom: 0, left: 0 };
const anchorTransform = { "top-left": "none", "top-right": "translateX(-100%)", center: "translate(-50%, -50%)", "bottom-left": "translateY(-100%)", "bottom-right": "translate(-100%, -100%)" };
type LayoutDragMode = "move" | "resize";
type TimingDragMode = "move" | "start" | "end";
type LayoutDrag = { mode: LayoutDragMode; clientX: number; clientY: number; width: number; height: number; x: number; y: number; overlayWidth: number; overlayHeight: number | null; pixelWidth: number; pixelHeight: number };
type CropDrag = { edge: CropEdge; clientX: number; clientY: number; fullWidth: number; fullHeight: number; crop: CutoutCrop };
type CropEdge = typeof cropEdges[number];
type CropInspectorProps = { overlay: CutoutProgramInterval["overlay"]; audio: ProgramAudioSource | null; onChange: CropChange; onAudioChange: AudioChange; onClose: () => void };
type TimingDrag = { mode: TimingDragMode; left: number; width: number; pointer: number; start: number; end: number };
type LayoutChange = (id: string, layout: OverlayLayout, commit: boolean) => void;
type CropChange = (id: string, crop: CutoutCrop, commit: boolean) => void;
type AudioChange = (subjectTrackId: string, volume: number, muted: boolean) => void;
type TimingChange = (id: string, start: number, end: number, commit: boolean) => void;
type CutoutOverlayStageProps = { project: VideoProject; mode: ViewMode; cutTime: number; playing: boolean; selectedId: string | null; onSelect: (id: string) => void; onLayoutChange: LayoutChange; onCropChange: CropChange; onAudioChange: AudioChange };
type CutoutOverlayTracksProps = { project: VideoProject; ranges: SourceRange[]; playhead: string; selectedId: string | null; onSelect: (id: string, start: number) => void; onTimingChange: TimingChange };
type EditableCutoutProps = { project: VideoProject; interval: CutoutProgramInterval; cutTime: number; playing: boolean; visible: boolean; selected: boolean; onSelect: (id: string) => void; onChange: LayoutChange; onCropChange: CropChange; onAudioChange: AudioChange };
type CutoutTimingClipProps = { interval: CutoutProgramInterval; duration: number; selected: boolean; onSelect: (id: string, start: number) => void; onChange: TimingChange };

import { Fragment, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { OverlayLayout, ProgramAudioSource, VideoProject } from "./analysis-model";
import { cutDuration, type SourceRange, type ViewMode } from "./editor-model";
import { cutoutProgramIntervals, type CutoutProgramInterval } from "./CutoutOverlayModel";
import { programRanges } from "./ProgramTimelineModel";
import { compositingLaneOrder } from "./CompositingLaneModel";
import { proportionalOverlaySize } from "./OverlayResizeModel";
import { synchronizeOverlayPlayback } from "./OverlayVideoPlayback";
import { croppedAspectRatio, type CutoutCrop } from "./CutoutCropModel";
import { groupedSubjectIntervals, subjectTrackLabel } from "./SubjectTrackModel";
