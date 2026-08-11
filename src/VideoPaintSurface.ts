export function superviseVideoPainting(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  let stopped = false;
  let failed = false;
  let callback = 0;
  const repaint = () => {
    try { paintVideoFrame(video, canvas); }
    catch (error) { if (!failed) logError("video_surface_paint_failed", error); failed = true; }
  };
  const paint = () => {
    if (stopped) return;
    repaint();
    callback = scheduleVideoFrame(video, paint);
  };
  callback = scheduleVideoFrame(video, paint);
  requestAnimationFrame(repaint);
  paintEvents.forEach((event) => video.addEventListener(event, repaint));
  window.addEventListener("resize", repaint);
  document.addEventListener("fullscreenchange", repaint);
  return () => {
    stopped = true;
    cancelVideoFrame(video, callback);
    paintEvents.forEach((event) => video.removeEventListener(event, repaint));
    window.removeEventListener("resize", repaint);
    document.removeEventListener("fullscreenchange", repaint);
  };
}

const paintEvents = ["loadeddata", "canplay", "play", "timeupdate", "seeked"] as const;

function scheduleVideoFrame(video: HTMLVideoElement, paint: VideoFrameRequestCallback) {
  return typeof video.requestVideoFrameCallback === "function" ? video.requestVideoFrameCallback(paint) : 0;
}

function cancelVideoFrame(video: HTMLVideoElement, callback: number) {
  if (callback && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(callback);
}

export function paintVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return false;
  const size = videoPaintSize(video.videoWidth, video.videoHeight, canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return false;
  context.drawImage(video, 0, 0, size.width, size.height);
  return true;
}

export function videoPaintSize(videoWidth: number, videoHeight: number, clientWidth: number, clientHeight: number, pixelRatio: number) {
  const width = Math.min(videoWidth, Math.max(1, Math.round(clientWidth * pixelRatio)));
  const height = Math.min(videoHeight, Math.max(1, Math.round(clientHeight * pixelRatio)));
  return { width, height };
}

import { logError } from "./structured-log";
