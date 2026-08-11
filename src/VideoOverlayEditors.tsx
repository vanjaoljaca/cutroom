export function VideoOverlayStage({ project, mode, cutTime, playing, selectedId, onSelect, onLayoutChange }: VideoOverlayStageProps) {
  const intervals = videoOverlayProgramIntervals(project, programRanges(project));
  return <div className="overlay-stage video-overlay-stage" aria-label="Video overlays">{intervals.map((interval) => <EditableVideoOverlay key={interval.overlay.id} project={project} interval={interval} cutTime={cutTime} playing={playing} visible={mode === "cut" && cutTime >= interval.start && cutTime <= interval.end} selected={selectedId === interval.overlay.id} onSelect={onSelect} onChange={onLayoutChange} />)}</div>;
}

export function VideoOverlayTracks({ project, ranges, playhead, selectedId, onSelect, onTimingChange }: VideoOverlayTracksProps) {
  const duration = cutDuration(ranges);
  return <>{videoOverlayProgramIntervals(project, ranges).map((interval) => { const order = compositingLaneOrder(interval.overlay.layer); return <Fragment key={interval.overlay.id}><div className="timeline-track-label video-track-label" style={{ order }}>Video</div><div className="video-overlay-track timeline-track-content" data-overlay-editor aria-label={`Video overlay ${interval.overlay.label}`} style={{ order }}><VideoTimingClip interval={interval} duration={duration} selected={selectedId === interval.overlay.id} onSelect={onSelect} onChange={onTimingChange} /><span className="track-playhead" aria-hidden="true" style={{ left: playhead }} /></div></Fragment>; })}</>;
}

function EditableVideoOverlay({ project, interval, cutTime, playing, visible, selected, onSelect, onChange }: EditableVideoOverlayProps) {
  const drag = useRef<LayoutDrag | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { void synchronizeOverlayVideo(videoRef.current, interval.overlay.sourceStart + cutTime - interval.start, playing && visible); }, [cutTime, interval, playing, visible]);
  const begin = (event: ReactPointerEvent<HTMLElement>, mode: LayoutDragMode) => beginLayoutDrag(event, mode, interval.overlay, drag, onSelect);
  const move = (event: ReactPointerEvent<HTMLElement>) => moveLayoutDrag(event, interval.overlay, drag, onChange);
  const finish = (event: ReactPointerEvent<HTMLElement>) => finishLayoutDrag(event, interval.overlay, drag, onChange);
  const source = project.mediaLibrary.sources.find((item) => item.id === interval.overlay.sourceId);
  return <div className={`video-overlay-item ${selected ? "selected" : ""}`} data-overlay-editor aria-hidden={!visible} style={overlayStyle(interval.overlay, source, visible)}><button className="overlay-move-surface" tabIndex={visible ? 0 : -1} aria-label={`Move ${interval.overlay.label} on video`} onClick={() => onSelect(interval.overlay.id)} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={finish}><video ref={videoRef} muted={interval.overlay.muted} playsInline preload="auto" src={`/api/projects/${project.id}/media/${interval.overlay.sourceId}`} /></button><button className="overlay-resize-handle" aria-label={`Resize ${interval.overlay.label}`} onPointerDown={(event) => begin(event, "resize")} onPointerMove={move} onPointerUp={finish} /></div>;
}

function VideoTimingClip({ interval, duration, selected, onSelect, onChange }: VideoTimingClipProps) {
  const drag = useRef<TimingDrag | null>(null);
  function begin(event: ReactPointerEvent<HTMLElement>, mode: TimingDragMode) {
    event.stopPropagation();
    const bounds = event.currentTarget.closest(".video-overlay-track")?.getBoundingClientRect();
    if (!bounds) return;
    drag.current = { mode, left: bounds.left, width: bounds.width, pointer: ((event.clientX - bounds.left) / bounds.width) * duration, start: interval.start, end: interval.end, nextStart: interval.start, nextEnd: interval.end };
    event.currentTarget.setPointerCapture(event.pointerId); onSelect(interval.overlay.id, interval.start);
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    const delta = ((event.clientX - drag.current.left) / drag.current.width) * duration - drag.current.pointer;
    const next = movedInterval(drag.current, delta, duration); drag.current.nextStart = next.start; drag.current.nextEnd = next.end;
    onChange(interval.overlay.id, next.start, next.end, false);
  }
  function finish(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation(); if (drag.current) onChange(interval.overlay.id, drag.current.nextStart, drag.current.nextEnd, true); drag.current = null;
  }
  const style = { left: `${(interval.start / duration) * 100}%`, width: `${((interval.end - interval.start) / duration) * 100}%` };
  return <span className={`video-overlay-clip ${selected ? "selected" : ""}`} style={style}><button className="video-overlay-move-handle" onClick={() => onSelect(interval.overlay.id, interval.start)} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={finish}><b>{interval.overlay.label}</b><i>{formatTime(interval.start)}</i></button><button className="overlay-time-handle start" aria-label={`Adjust start of ${interval.overlay.label}`} onPointerDown={(event) => begin(event, "start")} onPointerMove={move} onPointerUp={finish} /><button className="overlay-time-handle end" aria-label={`Adjust end of ${interval.overlay.label}`} onPointerDown={(event) => begin(event, "end")} onPointerMove={move} onPointerUp={finish} /></span>;
}

function beginLayoutDrag(event: ReactPointerEvent<HTMLElement>, mode: LayoutDragMode, overlay: VideoOverlay, drag: MutableRefObject<LayoutDrag | null>, onSelect: (id: string) => void) {
  event.stopPropagation();
  const bounds = event.currentTarget.closest(".viewer")?.getBoundingClientRect();
  const item = event.currentTarget.closest(".video-overlay-item")?.getBoundingClientRect();
  if (!bounds || !item) return;
  drag.current = { mode, clientX: event.clientX, clientY: event.clientY, width: bounds.width, height: bounds.height, x: overlay.layout.x, y: overlay.layout.y, overlayWidth: overlay.layout.width, overlayHeight: overlay.layout.height, pixelWidth: item.width, pixelHeight: item.height };
  event.currentTarget.setPointerCapture(event.pointerId); onSelect(overlay.id);
}

function moveLayoutDrag(event: ReactPointerEvent<HTMLElement>, overlay: VideoOverlay, drag: MutableRefObject<LayoutDrag | null>, onChange: LayoutChange) {
  if (!drag.current) return;
  event.stopPropagation(); onChange(overlay.id, changedLayout(overlay.layout, drag.current, event.clientX, event.clientY), false);
}

function finishLayoutDrag(event: ReactPointerEvent<HTMLElement>, overlay: VideoOverlay, drag: MutableRefObject<LayoutDrag | null>, onChange: LayoutChange) {
  event.stopPropagation();
  if (drag.current) onChange(overlay.id, changedLayout(overlay.layout, drag.current, event.clientX, event.clientY), true);
  drag.current = null;
}

function changedLayout(layout: OverlayLayout, drag: LayoutDrag, clientX: number, clientY: number): OverlayLayout {
  if (drag.mode === "resize") return { ...layout, ...proportionalOverlaySize({ clientX: drag.clientX, clientY: drag.clientY, pixelWidth: drag.pixelWidth, pixelHeight: drag.pixelHeight, width: drag.overlayWidth, height: drag.overlayHeight }, clientX, clientY) };
  return { ...layout, x: clamp(drag.x + (clientX - drag.clientX) / drag.width, 0, 1), y: clamp(drag.y + (clientY - drag.clientY) / drag.height, 0, 1), placementIntent: "explicit" };
}

function overlayStyle(overlay: VideoOverlay, source: VideoMediaSource | undefined, visible: boolean): CSSProperties {
  const aspect = source?.metadata ? `${source.metadata.width} / ${source.metadata.height}` : undefined;
  return { left: `${overlay.layout.x * 100}%`, top: `${overlay.layout.y * 100}%`, width: `${overlay.layout.width * 100}%`, height: overlay.layout.height === null ? "auto" : `${overlay.layout.height * 100}%`, aspectRatio: overlay.layout.height === null ? aspect : undefined, opacity: overlay.opacity, visibility: visible ? "visible" : "hidden", zIndex: 10 + overlay.layer, transform: anchorTransform[overlay.layout.anchor] };
}

function movedInterval(drag: TimingDrag, delta: number, duration: number) {
  const length = drag.end - drag.start;
  if (drag.mode === "start") return { start: clamp(drag.start + delta, 0, drag.end - minimumDuration), end: drag.end };
  if (drag.mode === "end") return { start: drag.start, end: clamp(drag.end + delta, drag.start + minimumDuration, duration) };
  const start = clamp(drag.start + delta, 0, duration - length); return { start, end: start + length };
}

async function synchronizeOverlayVideo(video: HTMLVideoElement | null, time: number, shouldPlay: boolean) {
  if (!video) return;
  if (Math.abs(video.currentTime - Math.max(0, time)) > 0.12) video.currentTime = Math.max(0, time);
  if (shouldPlay && video.paused) await video.play().catch(() => undefined);
  if (!shouldPlay && !video.paused) video.pause();
}

function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
const minimumDuration = 0.08;
const anchorTransform = { "top-left": "none", "top-right": "translateX(-100%)", center: "translate(-50%, -50%)", "bottom-left": "translateY(-100%)", "bottom-right": "translate(-100%, -100%)" };
type LayoutDragMode = "move" | "resize";
type TimingDragMode = "move" | "start" | "end";
type LayoutDrag = { mode: LayoutDragMode; clientX: number; clientY: number; width: number; height: number; x: number; y: number; overlayWidth: number; overlayHeight: number | null; pixelWidth: number; pixelHeight: number };
type TimingDrag = { mode: TimingDragMode; left: number; width: number; pointer: number; start: number; end: number; nextStart: number; nextEnd: number };
type LayoutChange = (id: string, layout: OverlayLayout, commit: boolean) => void;
type TimingChange = (id: string, start: number, end: number, commit: boolean) => void;
type VideoOverlayStageProps = { project: VideoProject; mode: ViewMode; cutTime: number; playing: boolean; selectedId: string | null; onSelect: (id: string) => void; onLayoutChange: LayoutChange };
type VideoOverlayTracksProps = { project: VideoProject; ranges: SourceRange[]; playhead: string; selectedId: string | null; onSelect: (id: string, start: number) => void; onTimingChange: TimingChange };
type EditableVideoOverlayProps = { project: VideoProject; interval: VideoOverlayProgramInterval; cutTime: number; playing: boolean; visible: boolean; selected: boolean; onSelect: (id: string) => void; onChange: LayoutChange };
type VideoTimingClipProps = { interval: VideoOverlayProgramInterval; duration: number; selected: boolean; onSelect: (id: string, start: number) => void; onChange: TimingChange };

import { Fragment, useEffect, useRef, type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import type { OverlayLayout, VideoMediaSource, VideoOverlay, VideoProject } from "./analysis-model";
import { cutDuration, formatTime, type SourceRange, type ViewMode } from "./editor-model";
import { compositingLaneOrder } from "./CompositingLaneModel";
import { proportionalOverlaySize } from "./OverlayResizeModel";
import { programRanges } from "./ProgramTimelineModel";
import { videoOverlayProgramIntervals, type VideoOverlayProgramInterval } from "./VideoOverlayModel";
