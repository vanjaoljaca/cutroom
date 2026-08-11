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
  private onBuffering: (buffering: boolean) => void = () => undefined;
  private attachedListeners: Array<[PlaybackMediaEvent, EventListener]> = [];
  private frames: FrameSummary = { callbacks: 0, total: 0, dropped: 0, firstWallTime: null, lastWallTime: null, firstMediaTime: null, lastMediaTime: null };

  attach(video: HTMLVideoElement, onBuffering: (buffering: boolean) => void) {
    this.detach();
    this.video = video;
    this.onBuffering = onBuffering;
    playbackEvents.forEach((type) => this.listen(type));
    this.frameCallback = this.scheduleFrame();
  }

  updateContext(context: PlaybackContext) { this.log.updateContext(context); }

  snapshot() {
    return { capturedAt: new Date().toISOString(), context: this.log.currentContext(), frames: { ...this.frames }, events: [...this.log.events] };
  }

  detach() {
    this.attachedListeners.forEach(([type, listener]) => this.video?.removeEventListener(type, listener));
    this.attachedListeners = [];
    if (this.video && this.frameCallback && this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.frameCallback);
    this.video = null;
    this.frameCallback = 0;
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
    this.frames = { callbacks: this.frames.callbacks + 1, total: quality?.totalVideoFrames || this.frames.callbacks + 1, dropped: quality?.droppedVideoFrames || 0, firstWallTime: this.frames.firstWallTime ?? wallTime, lastWallTime: wallTime, firstMediaTime: this.frames.firstMediaTime ?? metadata.mediaTime, lastMediaTime: metadata.mediaTime };
    this.frameCallback = this.scheduleFrame();
  }
}

export function installPlaybackDiagnosticSnapshot(diagnostics: PlaybackDiagnostics) {
  (window as PlaybackDiagnosticWindow).__cutroomPlaybackDiagnostics = () => diagnostics.snapshot();
}

const playbackEvents = ["waiting", "stalled", "suspend", "playing", "seeking", "seeked", "canplay", "play", "pause"] as const;
const emptyContext: PlaybackContext = { mode: "cut", sourceUrl: "", sourceTime: 0, programTime: 0, rangeIndex: 0 };

type PlaybackMediaEvent = typeof playbackEvents[number];
type PlaybackEventType = PlaybackMediaEvent | "source-swap" | "timeline-boundary";
type PlaybackContext = { mode: "cut" | "original"; sourceUrl: string; sourceTime: number; programTime: number; rangeIndex: number };
type PlaybackDiagnosticEvent = PlaybackContext & { at: string; type: PlaybackEventType };
type FrameSummary = { callbacks: number; total: number; dropped: number; firstWallTime: number | null; lastWallTime: number | null; firstMediaTime: number | null; lastMediaTime: number | null };
type PlaybackDiagnosticWindow = Window & { __cutroomPlaybackDiagnostics?: () => ReturnType<PlaybackDiagnostics["snapshot"]> };

import { logEvent } from "./structured-log";
