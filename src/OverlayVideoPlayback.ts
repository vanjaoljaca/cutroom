export function overlayPlaybackDecision(input: OverlayPlaybackInput): OverlayPlaybackDecision {
  if (!input.active) return { seek: null, play: false };
  const time = Math.max(0, input.time);
  const seek = Math.abs(input.currentTime - time) > 0.12 ? time : null;
  return { seek, play: input.playing };
}

export async function synchronizeOverlayPlayback(video: HTMLVideoElement | null, time: number, active: boolean, playing: boolean) {
  if (!video) return;
  const decision = overlayPlaybackDecision({ active, playing, time, currentTime: video.currentTime });
  if (decision.seek !== null) video.currentTime = decision.seek;
  if (decision.play && video.paused) await video.play().catch(() => undefined);
  if (!decision.play && !video.paused) video.pause();
}

type OverlayPlaybackInput = { active: boolean; playing: boolean; time: number; currentTime: number };
type OverlayPlaybackDecision = { seek: number | null; play: boolean };
