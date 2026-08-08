export async function createVideoThumbnails(source: string, duration: number, count = 12): Promise<string[]> {
  const video = await loadVideo(source);
  const times = Array.from({ length: count }, (_, index) => duration * ((index + 0.5) / count));
  const thumbnails: string[] = [];
  for (const time of times) thumbnails.push(await captureFrame(video, time));
  return thumbnails;
}

function loadVideo(source: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = source;
  return waitForEvent(video, "loadedmetadata").then(() => video);
}

async function captureFrame(video: HTMLVideoElement, time: number): Promise<string> {
  video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
  await waitForEvent(video, "seeked");
  const canvas = drawFrame(video);
  return canvas.toDataURL("image/jpeg", 0.68);
}

function drawFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 320;
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function waitForEvent(target: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true });
    target.addEventListener("error", () => reject(target.error), { once: true });
  });
}
