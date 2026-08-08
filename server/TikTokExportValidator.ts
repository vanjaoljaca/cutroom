export function validateTikTokRestrictions(media: TikTokMedia): TikTokValidation {
  const failures = [check(media.container.includes("mp4"), "container must be MP4"), check(media.videoCodec === "h264", "video must be H.264"), check(media.videoProfile === "High", "H.264 profile must be High"), check(media.averageFps >= 23 && media.averageFps <= 60.001, "frame rate must be 23–60 fps"), check(Math.abs(media.averageFps - 60) <= 0.001, "Cutroom TikTok preset must be 60 fps"), check(media.width === 1080 && media.height === 1920, "video must be 1080×1920 portrait"), check(media.pixelFormat === "yuv420p" && media.colorSpace === "bt709", "video must be yuv420p BT.709"), check(media.audioCodec === "aac" && media.audioSampleRate === 48000 && media.audioChannels === 2, "audio must be 48 kHz stereo AAC"), check(media.bytes < 4_000_000_000, "file must be under 4 GB")].filter((failure): failure is string => Boolean(failure));
  return { valid: failures.length === 0, failures };
}

function check(condition: boolean, failure: string): string | null { return condition ? null : failure; }

export type TikTokMedia = { container: string; videoCodec: string; videoProfile: string; averageFps: number; width: number; height: number; pixelFormat: string; colorSpace: string; audioCodec: string; audioSampleRate: number; audioChannels: number; bytes: number };
export type TikTokValidation = { valid: boolean; failures: string[] };
