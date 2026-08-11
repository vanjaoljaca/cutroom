async function main() {
  const args = parseArgs(process.argv.slice(2));
  const project = await readStoredProject(required(args, "project"));
  const source = args.source ? existingSource(project, args.source) : await importVideoSource(project, required(args, "path"), args.label || "Video overlay");
  const overlay = createOverlay(args, source);
  const sources = project.mediaLibrary.sources.some((item) => item.id === source.id) ? project.mediaLibrary.sources : [...project.mediaLibrary.sources, source];
  const saved = await writeStoredProject({ ...project, mediaLibrary: { ...project.mediaLibrary, sources }, videoOverlays: [...project.videoOverlays.filter((item) => item.id !== overlay.id), overlay] });
  console.info(JSON.stringify({ scope: "cutroom-video-overlay-cli", event: "video_overlay_attached", projectId: saved.id, revision: saved.revision, source, overlay }, null, 2));
}

async function importVideoSource(project: VideoProject, path: string, label: string): Promise<VideoMediaSource> {
  const digest = await digestFile(path);
  const extension = extname(path).slice(1).toLowerCase();
  const destination = join(projectDirectory(project.id), "media", `${digest.sha256}.${extension}`);
  await mkdir(dirname(destination), { recursive: true });
  if (!(await exists(destination))) await copyFile(path, destination);
  return { id: `media.overlay.${digest.sha256.slice(0, 16)}`, kind: "video", role: "reference", label, rawMediaId: null, origin: { type: "local", path: destination }, cache: null, metadata: await probeVideo(destination), createdAt: new Date().toISOString() };
}

function createOverlay(args: Record<string, string>, source: VideoMediaSource): VideoOverlay {
  const sourceStart = number(args, "source-start");
  const sourceEnd = number(args, "source-end");
  const targetStart = number(args, "target-start");
  const targetEnd = number(args, "target-end");
  const token = createHash("sha256").update(`${source.id}:${targetStart}:${targetEnd}`).digest("hex").slice(0, 16);
  return { id: args.id || `video-overlay.${token}`, kind: "video", label: args.label || source.label, sourceId: source.id, sourceStart, sourceEnd, target: { type: "selected-cut", start: targetStart, end: targetEnd }, layout: { anchor: "top-left", x: optionalNumber(args.x, 0.03), y: optionalNumber(args.y, 0.05), width: optionalNumber(args.width, 0.32), height: args.height ? Number(args.height) : null, fit: args.fit === "cover" ? "cover" : "contain", placementIntent: args.placement === "avoid-face-right" ? "avoid-face-right" : args.placement === "explicit" ? "explicit" : "avoid-face-left" }, layer: Math.round(optionalNumber(args.layer, 5)), opacity: optionalNumber(args.opacity, 1), muted: args.muted !== "false", createdAt: new Date().toISOString() };
}

async function probeVideo(path: string): Promise<VideoMediaMetadata> {
  const { stdout } = await execFile(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]);
  const probe = JSON.parse(stdout) as ProbeResult;
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (!video?.width || !video.height) throw new Error("Video overlay source has no readable video stream.");
  return { duration: Number(probe.format.duration), width: video.width, height: video.height, averageFps: rate(video.avg_frame_rate), videoCodec: video.codec_name, audioCodec: audio?.codec_name || null, container: probe.format.format_name };
}

async function digestFile(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return { sha256: hash.digest("hex") };
}

function existingSource(project: VideoProject, id: string) {
  const source = project.mediaLibrary.sources.find((item) => item.id === id);
  if (!source) throw new Error(`Unknown media source: ${id}`);
  return source;
}

function parseArgs(values: string[]) { const result: Record<string, string> = {}; for (let index = 0; index < values.length; index += 2) if (values[index]?.startsWith("--") && values[index + 1]) result[values[index].slice(2)] = values[index + 1]; return result; }
function required(args: Record<string, string>, key: string) { if (!args[key]) throw new Error(`Missing --${key}.`); return args[key]; }
function number(args: Record<string, string>, key: string) { const value = Number(required(args, key)); if (!Number.isFinite(value)) throw new Error(`Invalid --${key}.`); return value; }
function optionalNumber(value: string | undefined, fallback: number) { const parsed = Number(value); return value !== undefined && Number.isFinite(parsed) ? parsed : fallback; }
function rate(value = "0/1") { const [top, bottom] = value.split("/").map(Number); return bottom ? top / bottom : top; }
async function exists(path: string) { try { await access(path); return true; } catch { return false; } }

main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-video-overlay-cli", event: "video_overlay_attach_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import type { VideoMediaMetadata, VideoMediaSource, VideoOverlay, VideoProject } from "../src/analysis-model";
import { projectDirectory, readStoredProject, writeStoredProject } from "../server/project-store";

const execFile = promisify(execFileCallback);
const ffprobePath = process.env.CUTROOM_FFPROBE || "/opt/homebrew/bin/ffprobe";
type ProbeResult = { streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string }>; format: { duration: string; format_name: string } };
