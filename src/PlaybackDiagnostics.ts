export class PlaybackDiagnosticLog {
  readonly events: PlaybackDiagnosticEvent[] = [];
  private context: PlaybackContext = emptyContext;

  constructor(private readonly capacity = 120) {}

  updateContext(next: PlaybackContext, at = new Date().toISOString()) {
    const sourceChanged = next.sourceUrl !== this.context.sourceUrl;
    const rangeChanged = next.rangeIndex !== this.context.rangeIndex;
    this.context = next;
    if (sourceChanged) this.record("source-swap", at);
    if (rangeChanged) this.record("timeline-boundary", at);
  }

  record(type: PlaybackEventType, at = new Date().toISOString()) {
    this.events.push({ at, type, ...this.context });
    if (this.events.length > this.capacity) this.events.splice(0, this.events.length - this.capacity);
  }

  currentContext() { return this.context; }
}

export class PlaybackDiagnostics {
  readonly log = new PlaybackDiagnosticLog();
  private video: HTMLVideoElement | null = null;
  private frameCallback = 0;
  private animationCallback = 0;
  private onBuffering: (buffering: boolean) => void = () => undefined;
  private onHealth: (health: PlaybackHealth) => void = () => undefined;
  private lastHealthReport = 0;
  private attachedListeners: Array<[PlaybackMediaEvent, EventListener]> = [];
  private frames: FrameSummary = emptyFrames();

  attach(video: HTMLVideoElement, onBuffering: (buffering: boolean) => void, onHealth: (health: PlaybackHealth) => void) {
    this.detach();
    this.video = video;
    this.onBuffering = onBuffering;
    this.onHealth = onHealth;
    this.frames = emptyFrames();
    playbackEvents.forEach((type) => this.listen(type));
    this.frameCallback = this.scheduleFrame();
    this.animationCallback = requestAnimationFrame((wallTime) => this.captureAnimation(wallTime));
  }

  updateContext(context: PlaybackContext) { this.log.updateContext(context); }

  snapshot() {
    return { capturedAt: new Date().toISOString(), context: this.log.currentContext(), frames: { ...this.frames }, events: [...this.log.events] };
  }

  detach() {
    this.attachedListeners.forEach(([type, listener]) => this.video?.removeEventListener(type, listener));
    this.attachedListeners = [];
    if (this.video && this.frameCallback && this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.frameCallback);
    if (this.animationCallback) cancelAnimationFrame(this.animationCallback);
    this.video = null;
    this.frameCallback = 0;
    this.animationCallback = 0;
  }

  private listen(type: PlaybackMediaEvent) {
    const listener = () => this.handleEvent(type);
    this.video?.addEventListener(type, listener);
    this.attachedListeners.push([type, listener]);
  }

  private handleEvent(type: PlaybackMediaEvent) {
    this.log.record(type);
    if (type === "waiting" || type === "stalled") this.setBuffering(true, type);
    if (type === "playing" || type === "seeked" || type === "canplay") this.setBuffering(false, type);
  }

  private setBuffering(buffering: boolean, reason: PlaybackMediaEvent) {
    this.onBuffering(buffering);
    if (buffering) logEvent("playback_buffering", { reason, ...this.log.currentContext(), droppedFrames: this.frames.dropped });
  }

  private scheduleFrame() {
    if (!this.video?.requestVideoFrameCallback) return 0;
    return this.video.requestVideoFrameCallback((wallTime, metadata) => this.captureFrame(wallTime, metadata));
  }

  private captureFrame(wallTime: number, metadata: VideoFrameCallbackMetadata) {
    const quality = this.video?.getVideoPlaybackQuality?.();
    const total = quality?.totalVideoFrames || this.frames.callbacks + 1;
    const dropped = quality?.droppedVideoFrames || 0;
    this.frames = { ...this.frames, callbacks: this.frames.callbacks + 1, total, dropped, firstTotal: this.frames.firstTotal ?? total, firstDropped: this.frames.firstDropped ?? dropped, firstPresented: this.frames.firstPresented ?? metadata.presentedFrames, lastPresented: metadata.presentedFrames, firstWallTime: this.frames.firstWallTime ?? wallTime, lastWallTime: wallTime, firstMediaTime: this.frames.firstMediaTime ?? metadata.mediaTime, lastMediaTime: metadata.mediaTime };
    if (wallTime - this.lastHealthReport >= 1000) { this.lastHealthReport = wallTime; this.onHealth(playbackHealth(this.frames)); }
    this.frameCallback = this.scheduleFrame();
  }

  private captureAnimation(wallTime: number) {
    if (this.video && !this.video.paused) this.frames = { ...this.frames, animationCallbacks: this.frames.animationCallbacks + 1, firstAnimationWallTime: this.frames.firstAnimationWallTime ?? wallTime, lastAnimationWallTime: wallTime };
    this.animationCallback = requestAnimationFrame((nextWallTime) => this.captureAnimation(nextWallTime));
  }
}

export function installPlaybackDiagnosticSnapshot(diagnostics: PlaybackDiagnostics, setCanvasFallback: (enabled: boolean) => void) {
  const snapshot = Object.assign(() => diagnostics.snapshot(), { setCanvasFallback });
  (window as PlaybackDiagnosticWindow).__cutroomPlaybackDiagnostics = snapshot;
}

export function playbackHealth(frames: FrameSummary): PlaybackHealth {
  const seconds = Math.max(0.001, ((frames.lastWallTime || 0) - (frames.firstWallTime || 0)) / 1000);
  const animationSeconds = Math.max(0.001, ((frames.lastAnimationWallTime || 0) - (frames.firstAnimationWallTime || 0)) / 1000);
  return { observerHz: frames.callbacks / seconds, compositorHz: frames.animationCallbacks / animationSeconds, presentedFps: ((frames.lastPresented || 0) - (frames.firstPresented || 0)) / seconds, droppedFrames: frames.dropped - (frames.firstDropped ?? 0) };
}

function emptyFrames(): FrameSummary { return { callbacks: 0, animationCallbacks: 0, total: 0, dropped: 0, firstTotal: null, firstDropped: null, firstPresented: null, lastPresented: null, firstWallTime: null, lastWallTime: null, firstAnimationWallTime: null, lastAnimationWallTime: null, firstMediaTime: null, lastMediaTime: null }; }

const playbackEvents = ["waiting", "stalled", "suspend", "playing", "seeking", "seeked", "canplay", "play", "pause"] as const;
const emptyContext: PlaybackContext = { mode: "cut", sourceUrl: "", sourceTime: 0, programTime: 0, rangeIndex: 0 };

type PlaybackMediaEvent = typeof playbackEvents[number];
type PlaybackEventType = PlaybackMediaEvent | "source-swap" | "timeline-boundary";
type PlaybackContext = { mode: "cut" | "original"; sourceUrl: string; sourceTime: number; programTime: number; rangeIndex: number };
type PlaybackDiagnosticEvent = PlaybackContext & { at: string; type: PlaybackEventType };
type FrameSummary = { callbacks: number; animationCallbacks: number; total: number; dropped: number; firstTotal: number | null; firstDropped: number | null; firstPresented: number | null; lastPresented: number | null; firstWallTime: number | null; lastWallTime: number | null; firstAnimationWallTime: number | null; lastAnimationWallTime: number | null; firstMediaTime: number | null; lastMediaTime: number | null };
export type PlaybackHealth = { observerHz: number; compositorHz: number; presentedFps: number; droppedFrames: number };
type PlaybackDiagnosticSnapshot = (() => ReturnType<PlaybackDiagnostics["snapshot"]>) & { setCanvasFallback: (enabled: boolean) => void };
type PlaybackDiagnosticWindow = Window & { __cutroomPlaybackDiagnostics?: PlaybackDiagnosticSnapshot };

import { logEvent } from "./structured-log";
