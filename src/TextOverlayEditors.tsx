export function TextOverlayStage({ project, mode, cutTime, selectedId, onSelect, onPositionChange }: TextOverlayStageProps) {
  if (mode !== "cut") return null;
  const intervals = textOverlayProgramIntervals(project, programRanges(project)).filter(({ overlay }) => overlay.role === "title");
  return <div className="text-overlay-stage" aria-label="Text overlays">{intervals.map(({ overlay, start, end }) => <MovableText key={overlay.id} overlay={overlay} visible={cutTime >= start && cutTime <= end} selected={selectedId === overlay.id} onSelect={onSelect} onPositionChange={onPositionChange} />)}</div>;
}

function MovableText({ overlay, visible, selected, onSelect, onPositionChange }: MovableTextProps) {
  const drag = useRef<TextPositionDrag | null>(null);
  function begin(event: ReactPointerEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.closest(".text-overlay-stage")?.getBoundingClientRect(); if (!bounds) return;
    event.stopPropagation(); onSelect(overlay.id); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: overlay.layout.x, y: overlay.layout.y, clientX: event.clientX, clientY: event.clientY, width: bounds.width, height: bounds.height, nextX: overlay.layout.x, nextY: overlay.layout.y, dirty: false };
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const nextX = clamp(drag.current.x + (event.clientX - drag.current.clientX) / drag.current.width, 0, 1);
    const nextY = clamp(drag.current.y + (event.clientY - drag.current.clientY) / drag.current.height, 0, 1);
    drag.current.nextX = nextX; drag.current.nextY = nextY; drag.current.dirty = true; onPositionChange(overlay.id, nextX, nextY, false);
  }
  function finish() { if (drag.current?.dirty) onPositionChange(overlay.id, drag.current.nextX, drag.current.nextY, true); drag.current = null; }
  function nudge(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const delta = event.shiftKey ? 0.05 : 0.01; const movement = textPositionNudge(event.key, delta); if (!movement) return;
    event.preventDefault(); event.stopPropagation(); onSelect(overlay.id); onPositionChange(overlay.id, clamp(overlay.layout.x + movement.x, 0, 1), clamp(overlay.layout.y + movement.y, 0, 1), true);
  }
  return <button className={`text-overlay-item ${selected ? "selected" : ""}`} aria-label={`Move ${overlay.role} ${overlay.text}`} aria-hidden={!visible} title={`Move ${overlay.text}`} style={textOverlayStyle(overlay, visible)} onClick={() => onSelect(overlay.id)} onKeyDown={nudge} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>{overlay.text}</button>;
}

export function TextOverlayTracks({ project, ranges, playhead, selectedId, onSelect, onTimingChange, onUpdate }: TextOverlayTracksProps) {
  const duration = cutDuration(ranges);
  return <>{textOverlayProgramIntervals(project, ranges).filter(({ overlay }) => overlay.role === "title").map((interval) => <TextTimingTrack key={interval.overlay.id} interval={interval} duration={duration} playhead={playhead} selected={selectedId === interval.overlay.id} onSelect={onSelect} onTimingChange={onTimingChange} onUpdate={onUpdate} />)}</>;
}

function TextTimingTrack({ interval, duration, playhead, selected, onSelect, onTimingChange, onUpdate }: TextTimingTrackProps) {
  const drag = useRef<TimingDrag | null>(null);
  const [editing, setEditing] = useState(false);
  const { overlay, start, end } = interval;
  function begin(event: ReactPointerEvent<HTMLButtonElement>, mode: "move" | "start" | "end") {
    event.stopPropagation(); const bounds = event.currentTarget.closest(".text-overlay-track")?.getBoundingClientRect(); if (!bounds) return;
    drag.current = { mode, origin: event.clientX, width: bounds.width, start, end, nextStart: start, nextEnd: end, dirty: false }; event.currentTarget.setPointerCapture(event.pointerId); onSelect(overlay.id, start);
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return; const delta = ((event.clientX - drag.current.origin) / drag.current.width) * duration; const next = moved(drag.current, delta, duration); drag.current.nextStart = next.start; drag.current.nextEnd = next.end; drag.current.dirty = true; onTimingChange(overlay.id, next.start, next.end, false);
  }
  function finish() { if (drag.current?.dirty) onTimingChange(overlay.id, drag.current.nextStart, drag.current.nextEnd, true); drag.current = null; }
  const style = { left: `${(start / duration) * 100}%`, width: `${((end - start) / duration) * 100}%` };
  const order = compositingLaneOrder(overlay.layer);
  return <><div className="timeline-track-label text-track-label" style={{ order }}>{overlay.role === "caption" ? "Caption" : "Title"}</div><div className="text-overlay-track timeline-track-content" style={{ order }}><div className={`text-overlay-clip ${selected ? "selected" : ""}`} style={style} title={`${overlay.text} · ${clock(start)}–${clock(end)} · right-click to edit`} onContextMenu={(event) => { event.preventDefault(); onSelect(overlay.id, start); setEditing(true); }}><button className="text-overlay-edge start" aria-label={`Adjust start of ${overlay.text}`} onPointerDown={(event) => begin(event, "start")} onPointerMove={move} onPointerUp={finish} /><button className="text-overlay-move" aria-label={`Move ${overlay.text}`} onClick={() => onSelect(overlay.id, start)} onDoubleClick={() => setEditing(true)} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={finish}>{overlay.text}</button><button className="text-overlay-edge end" aria-label={`Adjust end of ${overlay.text}`} onPointerDown={(event) => begin(event, "end")} onPointerMove={move} onPointerUp={finish} /></div>{selected && <button className="text-overlay-summary" aria-label={`Edit ${overlay.text}`} onClick={() => setEditing(true)}>{overlay.text} · {clock(start)}–{clock(end)}</button>}<span className="track-playhead" aria-hidden="true" style={{ left: playhead }} /></div>{editing && <TextEditor overlay={overlay} onClose={() => setEditing(false)} onUpdate={onUpdate} />}</>;
}

function TextEditor({ overlay, onClose, onUpdate }: TextEditorProps) {
  const [text, setText] = useState(overlay.text);
  return <div className="text-editor-scrim" onPointerDown={onClose}><section className="text-editor" role="dialog" aria-modal="true" aria-label={`Edit ${overlay.role}`} onPointerDown={(event) => event.stopPropagation()}><header><strong>Edit {overlay.role}</strong><button aria-label="Close text editor" onClick={onClose}>×</button></header><textarea aria-label="Overlay text" value={text} onChange={(event) => setText(event.target.value)} /><label>Font preset<select aria-label="Font preset" value={overlay.style.fontFamily} onChange={(event) => onUpdate({ ...overlay, style: { ...overlay.style, fontFamily: event.target.value as TextOverlay["style"]["fontFamily"] } })}><option value="tiktok-sans">TikTok Sans</option><option value="classic-social">Classic social</option><option value="system-sans">System</option></select></label><label><input type="checkbox" checked={overlay.enabled} onChange={(event) => onUpdate({ ...overlay, enabled: event.target.checked })} /> Show in video</label><button onClick={() => { onUpdate({ ...overlay, text: text.trim() }); onClose(); }}>Save</button></section></div>;
}

export function textOverlayStyle(overlay: TextOverlay, visible: boolean): CSSProperties {
  const translate = overlay.layout.anchor === "center" ? "translate(-50%, -50%)" : overlay.layout.anchor === "bottom" ? "translate(-50%, -100%)" : "translate(-50%, 0)";
  return { display: visible ? "block" : "none", left: `${overlay.layout.x * 100}%`, top: `${overlay.layout.y * 100}%`, width: "max-content", maxWidth: `${overlay.layout.maxWidth * 100}%`, boxSizing: "border-box", transform: translate, color: overlay.style.color, background: overlay.style.backgroundColor || "transparent", WebkitTextStroke: overlay.style.strokeColor ? `${sourcePixelCss(overlay.style.strokeWidth)} ${overlay.style.strokeColor}` : undefined, textShadow: overlay.style.shadow ? `0 ${sourcePixelCss(2)} ${sourcePixelCss(8)} rgb(0 0 0 / 85%)` : undefined, textAlign: overlay.style.align, fontFamily: fontFamily(overlay.style.fontFamily), fontSize: sourcePixelCss(overlay.style.fontSize), fontWeight: overlay.style.fontWeight, opacity: overlay.opacity, zIndex: overlay.layer };
}

export function fontFamily(preset: TextOverlay["style"]["fontFamily"]) { if (preset === "tiktok-sans") return "'TikTok Sans', sans-serif"; if (preset === "classic-social") return "Arial, sans-serif"; return "system-ui, sans-serif"; }

export function sourcePixelCss(value: number) { return `${value / 10.8}cqw`; }

function moved(drag: TimingDrag, delta: number, duration: number) {
  if (drag.mode === "start") return { start: clamp(drag.start + delta, 0, drag.end - 0.04), end: drag.end };
  if (drag.mode === "end") return { start: drag.start, end: clamp(drag.end + delta, drag.start + 0.04, duration) };
  const length = drag.end - drag.start; const start = clamp(drag.start + delta, 0, duration - length); return { start, end: start + length };
}

function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
export function textPositionNudge(key: string, delta: number) { if (key === "ArrowLeft") return { x: -delta, y: 0 }; if (key === "ArrowRight") return { x: delta, y: 0 }; if (key === "ArrowUp") return { x: 0, y: -delta }; if (key === "ArrowDown") return { x: 0, y: delta }; return null; }
function clock(seconds: number) { const minutes = Math.floor(seconds / 60); return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`; }

type TextOverlayStageProps = { project: VideoProject; mode: ViewMode; cutTime: number; selectedId: string | null; onSelect: (id: string) => void; onPositionChange: (id: string, x: number, y: number, persist: boolean) => void };
type MovableTextProps = { overlay: TextOverlay; visible: boolean; selected: boolean; onSelect: (id: string) => void; onPositionChange: TextOverlayStageProps["onPositionChange"] };
type TextOverlayTracksProps = { project: VideoProject; ranges: SourceRange[]; playhead: string; selectedId: string | null; onSelect: (id: string, start: number) => void; onTimingChange: (id: string, start: number, end: number, persist: boolean) => void; onUpdate: (overlay: TextOverlay) => void };
type TextTimingTrackProps = { interval: TextOverlayProgramInterval; duration: number; playhead: string; selected: boolean; onSelect: TextOverlayTracksProps["onSelect"]; onTimingChange: TextOverlayTracksProps["onTimingChange"]; onUpdate: TextOverlayTracksProps["onUpdate"] };
type TextEditorProps = { overlay: TextOverlay; onClose: () => void; onUpdate: (overlay: TextOverlay) => void };
type TimingDrag = { mode: "move" | "start" | "end"; origin: number; width: number; start: number; end: number; nextStart: number; nextEnd: number; dirty: boolean };
type TextPositionDrag = { x: number; y: number; clientX: number; clientY: number; width: number; height: number; nextX: number; nextY: number; dirty: boolean };

import { useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { TextOverlay, VideoProject } from "./analysis-model";
import { compositingLaneOrder } from "./CompositingLaneModel";
import type { SourceRange, ViewMode } from "./editor-model";
import { cutDuration } from "./editor-model";
import { programRanges } from "./ProgramTimelineModel";
import { textOverlayProgramIntervals, type TextOverlayProgramInterval } from "./TextOverlayModel";
