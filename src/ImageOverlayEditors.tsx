export function ImageOverlayTracks({ project, ranges, playhead, selectedId, onSelect, onTimingChange, onCandidateSelect }: ImageOverlayTracksProps) {
  const duration = cutDuration(ranges);
  const intervals = imageOverlayCutIntervals(project, ranges);
  return <>{intervals.map((interval) => {
        const bundle = project.assetLibrary.bundles.find((item) => item.id === interval.overlay.bundleId);
        const candidates = bundle?.candidateAssetIds.map((id) => project.assetLibrary.assets.find((asset) => asset.id === id)).filter((asset): asset is ImageAsset => Boolean(asset)) || [];
        return <OverlayTimingClip key={interval.overlay.id} projectId={project.id} interval={interval} duration={duration} playhead={playhead} selected={selectedId === interval.overlay.id} candidates={candidates} selectedAssetId={bundle?.selectedAssetId || interval.overlay.assetId} onSelect={onSelect} onChange={onTimingChange} onCandidateSelect={bundle ? (assetId) => onCandidateSelect(bundle.id, assetId) : undefined} />;
  })}</>;
}

export function EditableOverlayStage({ project, mode, sourceTime, cutTime, selectedId, onSelect, onLayoutChange }: EditableOverlayStageProps) {
  const visibleIds = new Set(visibleImageOverlays(project, mode, sourceTime, cutTime).map((overlay) => overlay.id));
  return <div className="overlay-stage" aria-label="Image overlays">{project.overlays.map((overlay) => {
    const asset = project.assetLibrary.assets.find((item) => item.id === overlay.assetId);
    return <EditableOverlay key={overlay.id} overlay={overlay} asset={asset} projectId={project.id} visible={visibleIds.has(overlay.id)} selected={selectedId === overlay.id} onSelect={onSelect} onChange={onLayoutChange} />;
  })}</div>;
}

function OverlayTimingClip({ projectId, interval, duration, playhead, selected, candidates, selectedAssetId, onSelect, onChange, onCandidateSelect }: OverlayTimingClipProps) {
  const drag = useRef<TimingDrag | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const { overlay, start, end } = interval;
  useEffect(() => {
    if (menuPosition === null) return;
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menu.current?.contains(event.target as Node)) setMenuPosition(null);
    };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", dismiss);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", dismiss); };
  }, [menuPosition]);
  function begin(event: ReactPointerEvent<HTMLElement>, mode: TimingDragMode) {
    event.stopPropagation();
    const bounds = event.currentTarget.closest(".overlay-track")?.getBoundingClientRect();
    if (!bounds) return;
    const pointer = ((event.clientX - bounds.left) / bounds.width) * duration;
    drag.current = { mode, left: bounds.left, width: bounds.width, pointer, start, end, nextStart: start, nextEnd: end };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(overlay.id, start);
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    event.stopPropagation();
    const delta = ((event.clientX - drag.current.left) / drag.current.width) * duration - drag.current.pointer;
    const next = moveInterval(drag.current, delta, duration);
    drag.current.nextStart = next.start;
    drag.current.nextEnd = next.end;
    onChange(overlay.id, next.start, next.end, false);
  }
  function finish(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation();
    if (drag.current) onChange(overlay.id, drag.current.nextStart, drag.current.nextEnd, true);
    drag.current = null;
  }
  function nudge(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 0.4 : 0.04);
    const next = moveInterval({ mode: "move", left: 0, width: 1, pointer: 0, start, end, nextStart: start, nextEnd: end }, delta, duration);
    onChange(overlay.id, next.start, next.end, true);
  }
  function nudgeEdge(event: ReactKeyboardEvent<HTMLButtonElement>, mode: "start" | "end") {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const delta = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 0.4 : 0.04);
    const next = moveInterval({ mode, left: 0, width: 1, pointer: 0, start, end, nextStart: start, nextEnd: end }, delta, duration);
    onChange(overlay.id, next.start, next.end, true);
  }
  function openImageMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!candidates.length) return;
    event.preventDefault(); event.stopPropagation();
    setMenuPosition({ left: clamp(event.clientX, 8, innerWidth - 206), top: clamp(event.clientY + 8, 8, innerHeight - 82) });
    onSelect(overlay.id, start);
  }
  function chooseImage(assetId: string) {
    onCandidateSelect?.(assetId);
    setMenuPosition(null);
  }
  const style = { left: `${(start / duration) * 100}%`, width: `${((end - start) / duration) * 100}%` };
  const order = compositingLaneOrder(overlay.layer);
  return <><div className="timeline-track-label image-track-label" style={{ order }}>Image</div><div className="overlay-track timeline-track-content" data-overlay-editor aria-label={`Image overlay ${overlay.label}`} style={{ order }}><div className={`overlay-clip ${selected ? "selected" : ""}`} title={`${overlay.label} · ${formatTime(start)}–${formatTime(end)} · Right-click to choose image`} style={style} onContextMenu={openImageMenu}><button className="overlay-move-handle" aria-label={`Move ${overlay.label}`} onClick={() => onSelect(overlay.id, start)} onKeyDown={nudge} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={finish}><b>{overlay.label}</b><i>{formatTime(start)}</i></button><button className="overlay-time-handle start" aria-label={`Adjust start of ${overlay.label}`} onKeyDown={(event) => nudgeEdge(event, "start")} onPointerDown={(event) => begin(event, "start")} onPointerMove={move} onPointerUp={finish} /><button className="overlay-time-handle end" aria-label={`Adjust end of ${overlay.label}`} onKeyDown={(event) => nudgeEdge(event, "end")} onPointerDown={(event) => begin(event, "end")} onPointerMove={move} onPointerUp={finish} /></div>{menuPosition && <div className="overlay-context-menu" ref={menu} role="menu" aria-label={`${overlay.label} image menu`} style={menuPosition}><strong>Choose image</strong><div className="candidate-options">{candidates.map((asset, index) => <button key={asset.id} role="menuitemradio" aria-checked={asset.id === selectedAssetId} className={asset.id === selectedAssetId ? "selected" : ""} aria-label={`Use image ${index + 1} for ${overlay.label}`} title={asset.label} onClick={() => chooseImage(asset.id)}><img loading="lazy" decoding="async" src={`/api/projects/${projectId}/assets/${asset.id}`} alt="" /></button>)}</div></div>}<span className="track-playhead" aria-hidden="true" style={{ left: playhead }} /></div></>;
}

function EditableOverlay({ overlay, asset, projectId, visible, selected, onSelect, onChange }: EditableOverlayProps) {
  const drag = useRef<LayoutDrag | null>(null);
  const [preview, setPreview] = useState<OverlayLayout | null>(null);
  function begin(event: ReactPointerEvent<HTMLElement>, mode: LayoutDragMode) {
    event.stopPropagation();
    const bounds = event.currentTarget.closest(".viewer")?.getBoundingClientRect();
    const overlayBounds = event.currentTarget.closest(".image-overlay-item")?.getBoundingClientRect();
    if (!bounds || !overlayBounds) return;
    drag.current = { mode, clientX: event.clientX, clientY: event.clientY, width: bounds.width, height: bounds.height, x: overlay.layout.x, y: overlay.layout.y, overlayWidth: overlay.layout.width, overlayHeight: null, pixelWidth: overlayBounds.width, pixelHeight: overlayBounds.height };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(overlay.id);
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    event.stopPropagation();
    setPreview(changedLayout(overlay.layout, drag.current, event.clientX, event.clientY));
  }
  function finish(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation();
    if (drag.current) onChange(overlay.id, changedLayout(overlay.layout, drag.current, event.clientX, event.clientY), true);
    drag.current = null;
    setPreview(null);
  }
  function nudge(event: ReactKeyboardEvent<HTMLElement>) {
    if (!arrowKeys.has(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.04 : 0.01;
    const x = clamp(overlay.layout.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), 0, 1);
    const y = clamp(overlay.layout.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), 0, 1);
    onChange(overlay.id, { ...overlay.layout, x, y }, true);
  }
  function resizeNudge(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.key === "ArrowLeft" ? -0.02 : 0.02;
    onChange(overlay.id, { ...overlay.layout, ...scaleOverlaySize(overlay.layout, 1 + delta / overlay.layout.width) }, true);
  }
  const style = overlayFrameStyle(overlay, preview || { ...overlay.layout, height: null }, asset, visible);
  return <div className={`image-overlay-item ${selected ? "selected" : ""}`} data-overlay-editor aria-hidden={!visible} style={style}><button className="overlay-move-surface" tabIndex={visible ? 0 : -1} aria-label={`Move ${overlay.label} on video`} onClick={() => onSelect(overlay.id)} onKeyDown={nudge} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={finish}><img decoding="async" draggable={false} src={`/api/projects/${projectId}/assets/${overlay.assetId}`} alt={overlay.label} /></button><button className="overlay-resize-handle" aria-label={`Resize ${overlay.label}`} onKeyDown={resizeNudge} onPointerDown={(event) => begin(event, "resize")} onPointerMove={move} onPointerUp={finish} /></div>;
}

function changedLayout(layout: OverlayLayout, drag: LayoutDrag, clientX: number, clientY: number): OverlayLayout {
  const deltaX = (clientX - drag.clientX) / drag.width;
  const deltaY = (clientY - drag.clientY) / drag.height;
  if (drag.mode === "resize") return { ...layout, ...proportionalOverlaySize({ clientX: drag.clientX, clientY: drag.clientY, pixelWidth: drag.pixelWidth, pixelHeight: drag.pixelHeight, width: drag.overlayWidth, height: drag.overlayHeight }, clientX, clientY) };
  return { ...layout, x: clamp(drag.x + deltaX, 0, 1), y: clamp(drag.y + deltaY, 0, 1), placementIntent: "explicit" };
}

function moveInterval(drag: TimingDrag, delta: number, duration: number) {
  const length = drag.end - drag.start;
  if (drag.mode === "start") return { start: clamp(drag.start + delta, 0, drag.end - 0.08), end: drag.end };
  if (drag.mode === "end") return { start: drag.start, end: clamp(drag.end + delta, drag.start + 0.08, duration) };
  const start = clamp(drag.start + delta, 0, duration - length);
  return { start, end: start + length };
}

function overlayFrameStyle(overlay: ImageOverlay, layout: OverlayLayout, asset: ImageAsset | undefined, visible: boolean): CSSProperties {
  return { left: `${layout.x * 100}%`, top: `${layout.y * 100}%`, width: `${layout.width * 100}%`, height: "auto", aspectRatio: asset ? `${asset.width} / ${asset.height}` : undefined, opacity: overlay.opacity, visibility: visible ? "visible" : "hidden", zIndex: 10 + overlay.layer, transform: anchorTransform[layout.anchor] };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

const arrowKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
const anchorTransform = { "top-left": "none", "top-right": "translateX(-100%)", center: "translate(-50%, -50%)", "bottom-left": "translateY(-100%)", "bottom-right": "translate(-100%, -100%)" };
type TimingDragMode = "move" | "start" | "end";
type LayoutDragMode = "move" | "resize";
type TimingDrag = { mode: TimingDragMode; left: number; width: number; pointer: number; start: number; end: number; nextStart: number; nextEnd: number };
type LayoutDrag = { mode: LayoutDragMode; clientX: number; clientY: number; width: number; height: number; x: number; y: number; overlayWidth: number; overlayHeight: number | null; pixelWidth: number; pixelHeight: number };
type MenuPosition = { left: number; top: number };
type OverlayTimingChange = (id: string, start: number, end: number, commit: boolean) => void;
type OverlayLayoutChange = (id: string, layout: OverlayLayout, commit: boolean) => void;
type ImageOverlayTracksProps = { project: VideoProject; ranges: SourceRange[]; playhead: string; selectedId: string | null; onSelect: (id: string, start: number) => void; onTimingChange: OverlayTimingChange; onCandidateSelect: (bundleId: string, assetId: string) => void };
type EditableOverlayStageProps = { project: VideoProject; mode: ViewMode; sourceTime: number; cutTime: number; selectedId: string | null; onSelect: (id: string) => void; onLayoutChange: OverlayLayoutChange };
type OverlayTimingClipProps = { projectId: string; interval: ImageOverlayCutInterval; duration: number; playhead: string; selected: boolean; candidates: ImageAsset[]; selectedAssetId: string; onSelect: (id: string, start: number) => void; onChange: OverlayTimingChange; onCandidateSelect?: (assetId: string) => void };
type EditableOverlayProps = { overlay: ImageOverlay; asset: ImageAsset | undefined; projectId: string; visible: boolean; selected: boolean; onSelect: (id: string) => void; onChange: OverlayLayoutChange };

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ImageAsset, ImageOverlay, OverlayLayout, VideoProject } from "./analysis-model";
import { cutDuration, formatTime, type SourceRange, type ViewMode } from "./editor-model";
import { imageOverlayCutIntervals, visibleImageOverlays, type ImageOverlayCutInterval } from "./overlay-model";
import { compositingLaneOrder } from "./CompositingLaneModel";
import { proportionalOverlaySize, scaleOverlaySize } from "./OverlayResizeModel";
