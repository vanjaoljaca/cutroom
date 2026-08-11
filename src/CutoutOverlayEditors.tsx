export function CutoutOverlayStage({ project, mode, cutTime, playing, selectedId, onSelect, onLayoutChange }: CutoutOverlayStageProps) {
  const ranges = programRanges(project);
  const ready = cutoutProgramIntervals(project, ranges).filter((interval) => interval.overlay.processing.status === "ready");
  return <div className="overlay-stage cutout-stage" aria-label="Subject cutouts">{ready.map((interval) => (
    <EditableCutout key={interval.overlay.id} projectId={project.id} interval={interval} cutTime={cutTime} playing={playing} visible={mode === "cut" && cutTime >= interval.start && cutTime <= interval.end} selected={selectedId === interval.overlay.id} onSelect={onSelect} onChange={onLayoutChange} />
  ))}</div>;
}

export function CutoutOverlayTracks({ project, ranges, playhead, selectedId, onSelect, onTimingChange }: CutoutOverlayTracksProps) {
  const duration = cutDuration(ranges);
  const intervals = cutoutProgramIntervals(project, ranges);
  if (!intervals.length) return null;
  return <>{intervals.map((interval) => { const order = compositingLaneOrder(interval.overlay.layer); return <Fragment key={interval.overlay.id}><div className="timeline-track-label cutout-track-label" style={{ order }}>Cutout</div><div className="cutout-tracks timeline-track-content" data-overlay-editor aria-label={`Subject cutout ${interval.overlay.label}`} style={{ order }}><CutoutTimingClip interval={interval} duration={duration} selected={selectedId === interval.overlay.id} onSelect={onSelect} onChange={onTimingChange} /><span className="track-playhead" aria-hidden="true" style={{ left: playhead }} /></div></Fragment>; })}</>;
}

function EditableCutout({ projectId, interval, cutTime, playing, visible, selected, onSelect, onChange }: EditableCutoutProps) {
  const drag = useRef<LayoutDrag | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { void synchronizeOverlayPlayback(videoRef.current, cutTime - interval.start, visible, playing); }, [cutTime, interval.start, playing, visible]);
  function begin(event: ReactPointerEvent<HTMLElement>, mode: LayoutDragMode) {
    event.stopPropagation();
    const bounds = event.currentTarget.closest(".viewer")?.getBoundingClientRect();
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
  const overlay = interval.overlay;
  const style = overlayFrameStyle(overlay.layout, overlay.opacity, overlay.layer, visible);
  return <div className={`cutout-overlay-item ${selected ? "selected" : ""}`} data-overlay-editor aria-hidden={!visible} style={style}><button className="overlay-move-surface" tabIndex={visible ? 0 : -1} aria-label={`Move ${overlay.label} on video`} onClick={() => onSelect(overlay.id)} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={finish}><video ref={videoRef} muted playsInline preload="metadata" src={`/api/projects/${projectId}/cutouts/${overlay.id}/preview`} /></button><button className="overlay-resize-handle" aria-label={`Resize ${overlay.label}`} onPointerDown={(event) => begin(event, "resize")} onPointerMove={move} onPointerUp={finish} /></div>;
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
const anchorTransform = { "top-left": "none", "top-right": "translateX(-100%)", center: "translate(-50%, -50%)", "bottom-left": "translateY(-100%)", "bottom-right": "translate(-100%, -100%)" };
type LayoutDragMode = "move" | "resize";
type TimingDragMode = "move" | "start" | "end";
type LayoutDrag = { mode: LayoutDragMode; clientX: number; clientY: number; width: number; height: number; x: number; y: number; overlayWidth: number; overlayHeight: number | null; pixelWidth: number; pixelHeight: number };
type TimingDrag = { mode: TimingDragMode; left: number; width: number; pointer: number; start: number; end: number };
type LayoutChange = (id: string, layout: OverlayLayout, commit: boolean) => void;
type TimingChange = (id: string, start: number, end: number, commit: boolean) => void;
type CutoutOverlayStageProps = { project: VideoProject; mode: ViewMode; cutTime: number; playing: boolean; selectedId: string | null; onSelect: (id: string) => void; onLayoutChange: LayoutChange };
type CutoutOverlayTracksProps = { project: VideoProject; ranges: SourceRange[]; playhead: string; selectedId: string | null; onSelect: (id: string, start: number) => void; onTimingChange: TimingChange };
type EditableCutoutProps = { projectId: string; interval: CutoutProgramInterval; cutTime: number; playing: boolean; visible: boolean; selected: boolean; onSelect: (id: string) => void; onChange: LayoutChange };
type CutoutTimingClipProps = { interval: CutoutProgramInterval; duration: number; selected: boolean; onSelect: (id: string, start: number) => void; onChange: TimingChange };

import { Fragment, useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { OverlayLayout, VideoProject } from "./analysis-model";
import { cutDuration, type SourceRange, type ViewMode } from "./editor-model";
import { cutoutProgramIntervals, type CutoutProgramInterval } from "./CutoutOverlayModel";
import { programRanges } from "./ProgramTimelineModel";
import { compositingLaneOrder } from "./CompositingLaneModel";
import { proportionalOverlaySize } from "./OverlayResizeModel";
import { synchronizeOverlayPlayback } from "./OverlayVideoPlayback";
