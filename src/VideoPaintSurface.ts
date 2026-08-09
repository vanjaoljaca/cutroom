export function superviseVideoPainting(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  let stopped = false;
  let failed = false;
  let callback = 0;
  const paint = () => {
    if (stopped) return;
    try { paintVideoFrame(video, canvas); }
    catch (error) {
      if (!failed) logError("video_surface_paint_failed", error);
      failed = true;
    }
    callback = video.requestVideoFrameCallback(paint);
  };
  callback = video.requestVideoFrameCallback(paint);
  const repaint = () => paintVideoFrame(video, canvas);
  video.addEventListener("loadeddata", repaint);
  video.addEventListener("seeked", repaint);
  window.addEventListener("resize", repaint);
  document.addEventListener("fullscreenchange", repaint);
  return () => {
    stopped = true;
    video.cancelVideoFrameCallback(callback);
    video.removeEventListener("loadeddata", repaint);
    video.removeEventListener("seeked", repaint);
    window.removeEventListener("resize", repaint);
    document.removeEventListener("fullscreenchange", repaint);
  };
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
