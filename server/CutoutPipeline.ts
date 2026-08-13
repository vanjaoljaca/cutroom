export async function renderCutoutArtifacts(project: VideoProject, overlay: SubjectCutoutOverlay, onProgress?: (progress: CutoutProgress) => void, signal?: AbortSignal): Promise<CutoutArtifacts> {
  log("cutout_render_started", { projectId: project.id, overlayId: overlay.id, sourceId: overlay.sourceId });
  await assertRuntimeStorageAvailable();
  await access(rembgPythonPath).catch(() => { throw new Error(`Local person segmentation is not installed at ${rembgPythonPath}.`); });
  const source = project.mediaLibrary.sources.find((candidate) => candidate.id === overlay.sourceId);
  if (!source) throw new Error(`Unknown cutout source: ${overlay.sourceId}`);
  const destination = join(projectDirectory(project.id), "derived", "cutouts", overlay.id);
  const work = join(projectDirectory(project.id), "derived", "cutouts", `.work-${randomUUID()}`);
  const draft = join(work, "artifacts");
  try {
    await mkdir(draft, { recursive: true });
    onProgress?.({ phase: "extracting", progress: 0.02, message: "Starting VideoToolbox decode…" });
    await streamCutout(mediaSourcePath(source), overlay, draft, onProgress, signal);
    onProgress?.({ phase: "finalizing", progress: 0.97, message: "Finalizing cutout…" });
    const recipePath = join(draft, "recipe.json");
    await writeFile(recipePath, `${JSON.stringify(recipe(project, overlay), null, 2)}\n`);
    await publishCutoutArtifacts(draft, destination);
    log("cutout_render_completed", { projectId: project.id, overlayId: overlay.id, destination });
    return relativeArtifacts(overlay.id);
  } finally { await rm(work, { recursive: true, force: true }); }
}

export async function publishCutoutArtifacts(draft: string, destination: string) {
  await mkdir(destination, { recursive: true });
  const publishId = randomUUID();
  for (const name of artifactNames) await rename(join(draft, name), join(destination, `.${name}.${publishId}.partial`));
  for (const name of artifactNames) await rename(join(destination, `.${name}.${publishId}.partial`), join(destination, name));
  log("cutout_artifacts_published", { destination });
}

async function streamCutout(path: string, overlay: SubjectCutoutOverlay, destination: string, onProgress?: (progress: CutoutProgress) => void, signal?: AbortSignal) {
  const duration = overlay.sourceEnd - overlay.sourceStart;
  const dimensions = await displayedDimensions(path);
  const frames = Math.ceil(duration * cutoutFps);
  const decoder = spawn(ffmpegPath, decoderArgs(path, overlay, dimensions), { stdio: ["ignore", "pipe", "pipe"] });
  const segmenter = spawn(rembgPythonPath, [pythonScript, String(dimensions.width), String(dimensions.height), String(frames)], { env: { ...process.env, U2NET_HOME: rembgModelRoot }, stdio: ["pipe", "pipe", "pipe"] });
  const encoder = spawn(ffmpegPath, encoderArgs(destination, dimensions), { stdio: ["pipe", "ignore", "pipe"] });
  pipeSafely(decoder.stdout!, segmenter.stdin!);
  pipeSafely(segmenter.stdout!, encoder.stdin!);
  await supervisePipeline([decoder, segmenter, encoder], onProgress, signal);
}

function pipeSafely(source: NodeJS.ReadableStream, destination: NodeJS.WritableStream) {
  source.on("error", (error: NodeJS.ErrnoException) => { if (error.code !== "EPIPE") log("cutout_pipe_read_failed", { error: error.message }); });
  destination.on("error", (error: NodeJS.ErrnoException) => { if (error.code !== "EPIPE") log("cutout_pipe_write_failed", { error: error.message }); });
  source.pipe(destination);
}

function updateFrameProgress(output: string, onProgress?: (progress: CutoutProgress) => void) {
  const matches = [...output.matchAll(/"frame":\s*(\d+).*"frames":\s*(\d+)/g)];
  const latest = matches.at(-1);
  if (latest) onProgress?.({ phase: "segmenting", progress: 0.18 + (Number(latest[1]) / Number(latest[2])) * 0.62, message: `Removing background · ${latest[1]}/${latest[2]} frames` });
}

export function decoderArgs(path: string, overlay: SubjectCutoutOverlay, dimensions: Dimensions) {
  return ["-hide_banner", "-loglevel", "error", "-hwaccel", "videotoolbox", "-ss", String(overlay.sourceStart), "-t", String(overlay.sourceEnd - overlay.sourceStart), "-i", path, "-vf", `fps=${cutoutFps}`, "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"];
}

export function encoderArgs(destination: string, dimensions: Dimensions) {
  const input = ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-video_size", `${dimensions.width}x${dimensions.height}`, "-framerate", String(cutoutFps), "-i", "pipe:0"];
  const preview = ["-map", "0:v", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "18", join(destination, "preview.webm")];
  const render = ["-map", "0:v", "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(destination, "render.mov")];
  return [...input, ...preview, ...render];
}

async function supervisePipeline(children: ReturnType<typeof spawn>[], onProgress?: (progress: CutoutProgress) => void, signal?: AbortSignal) {
  const errors = new Map<number, string>();
  children.forEach((child, index) => child.stderr!.on("data", (chunk) => { const output = String(chunk); errors.set(index, `${errors.get(index) || ""}${output}`.slice(-8000)); if (index === 1) updateFrameProgress(output, onProgress); }));
  const stop = () => children.forEach((child) => child.kill("SIGTERM"));
  signal?.addEventListener("abort", stop, { once: true });
  const timeout = setTimeout(stop, 30 * 60_000);
  try { if (signal?.aborted) stop(); await Promise.all(children.map((child, index) => processExit(child, index, errors))); }
  catch (error) { stop(); throw error; }
  finally { clearTimeout(timeout); signal?.removeEventListener("abort", stop); }
}

async function processExit(child: ReturnType<typeof spawn>, index: number, errors: Map<number, string>) {
  await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", (code) => code === 0 ? resolve() : reject(new Error(errors.get(index)?.trim() || `Cutout stage ${index + 1} exited with code ${code}.`))); });
}

async function displayedDimensions(path: string): Promise<Dimensions> {
  const { stdout } = await execFile(ffprobePath, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation", "-of", "json", path]);
  const stream = JSON.parse(stdout).streams?.[0];
  if (!stream?.width || !stream?.height) throw new Error("Could not determine cutout source dimensions.");
  const rotation = Number(stream.side_data_list?.[0]?.rotation || 0);
  return Math.abs(rotation) % 180 === 90 ? { width: stream.height, height: stream.width } : { width: stream.width, height: stream.height };
}

function recipe(project: VideoProject, overlay: SubjectCutoutOverlay) {
  return { version: 2, provider: overlay.processing.provider, providerVersion: overlay.processing.providerVersion, backend: "onnxruntime-coreml", computeUnits: "ALL", decode: "videotoolbox", transport: "bounded-raw-frame-pipe", projectId: project.id, overlayId: overlay.id, sourceId: overlay.sourceId, sourceStart: overlay.sourceStart, sourceEnd: overlay.sourceEnd, fps: cutoutFps, modelHome: "runtime/rembg/models", createdAt: new Date().toISOString() };
}

function relativeArtifacts(id: string): CutoutArtifacts {
  const root = `derived/cutouts/${id}`;
  return { previewPath: `${root}/preview.webm`, renderPath: `${root}/render.mov`, recipePath: `${root}/recipe.json` };
}

function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-cutout", event, ...details })); }

export type CutoutArtifacts = { previewPath: string; renderPath: string; recipePath: string };
export type CutoutProgress = { phase: NonNullable<SubjectCutoutOverlay["processing"]["phase"]>; progress: number; message: string };
export type Dimensions = { width: number; height: number };

import { execFile as execFileCallback, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SubjectCutoutOverlay, VideoProject } from "../src/analysis-model";
import { assertRuntimeStorageAvailable } from "./RuntimeStorage";
import { mediaSourcePath } from "./ReferenceMediaCache";
import { projectDirectory } from "./project-store";

const execFile = promisify(execFileCallback);
const ffmpegPath = process.env.CUTROOM_FFMPEG || "/opt/homebrew/bin/ffmpeg";
const ffprobePath = process.env.CUTROOM_FFPROBE || "/opt/homebrew/bin/ffprobe";
const rembgPythonPath = process.env.CUTROOM_REMBG_PYTHON || "/Volumes/VanjaOljacaX/Cutroom/runtime/rembg/.venv/bin/python";
const rembgModelRoot = process.env.CUTROOM_REMBG_MODELS || "/Volumes/VanjaOljacaX/Cutroom/runtime/rembg/models";
const pythonScript = fileURLToPath(new URL("../scripts/RemoveVideoBackground.py", import.meta.url));
const cutoutFps = 30;
const artifactNames = ["preview.webm", "render.mov", "recipe.json"];
