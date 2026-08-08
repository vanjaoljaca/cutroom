export async function renderCutoutArtifacts(project: VideoProject, overlay: SubjectCutoutOverlay, onProgress?: (progress: number) => void): Promise<CutoutArtifacts> {
  log("cutout_render_started", { projectId: project.id, overlayId: overlay.id, sourceId: overlay.sourceId });
  await access(rembgPythonPath).catch(() => { throw new Error(`Local person segmentation is not installed at ${rembgPythonPath}.`); });
  const source = project.mediaLibrary.sources.find((candidate) => candidate.id === overlay.sourceId);
  if (!source) throw new Error(`Unknown cutout source: ${overlay.sourceId}`);
  const destination = join(projectDirectory(project.id), "derived", "cutouts", overlay.id);
  const work = join(projectDirectory(project.id), "derived", "cutouts", `.work-${randomUUID()}`);
  const draft = join(work, "artifacts");
  try {
    await prepareWork(work);
    await extractFrames(mediaSourcePath(source), overlay, work);
    onProgress?.(0.18);
    await segmentFrames(work, onProgress);
    await encodeArtifacts(work, draft);
    const recipePath = join(draft, "recipe.json");
    await writeFile(recipePath, `${JSON.stringify(recipe(project, overlay), null, 2)}\n`);
    await mkdir(join(projectDirectory(project.id), "derived", "cutouts"), { recursive: true });
    await rename(draft, destination);
    log("cutout_render_completed", { projectId: project.id, overlayId: overlay.id, destination });
    return relativeArtifacts(overlay.id);
  } finally { await rm(work, { recursive: true, force: true }); }
}

async function prepareWork(work: string) {
  await mkdir(join(work, "source"), { recursive: true });
  await mkdir(join(work, "transparent"), { recursive: true });
}

async function extractFrames(path: string, overlay: SubjectCutoutOverlay, work: string) {
  const duration = overlay.sourceEnd - overlay.sourceStart;
  await command(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(overlay.sourceStart), "-t", String(duration), "-i", path, "-vf", `fps=${cutoutFps}`, "-start_number", "0", join(work, "source", "%06d.png")], {});
}

async function segmentFrames(work: string, onProgress?: (progress: number) => void) {
  const source = join(work, "source");
  const output = join(work, "transparent");
  await streamingCommand(rembgPythonPath, [pythonScript, source, output], { ...process.env, U2NET_HOME: rembgModelRoot }, (output) => updateFrameProgress(output, onProgress));
}

function updateFrameProgress(output: string, onProgress?: (progress: number) => void) {
  const matches = [...output.matchAll(/"frame":\s*(\d+).*"frames":\s*(\d+)/g)];
  const latest = matches.at(-1);
  if (latest) onProgress?.(0.18 + (Number(latest[1]) / Number(latest[2])) * 0.62);
}

async function streamingCommand(executable: string, args: string[], env: NodeJS.ProcessEnv, onOutput: (output: string) => void) {
  const child = spawn(executable, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => superviseProcess(child, onOutput, resolve, reject));
}

function superviseProcess(child: ReturnType<typeof spawn>, onOutput: (output: string) => void, resolve: () => void, reject: (error: Error) => void) {
  let stderr = "";
  const timeout = setTimeout(() => child.kill("SIGTERM"), 30 * 60_000);
  child.stdout!.on("data", (chunk) => onOutput(String(chunk)));
  child.stderr!.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
  child.on("error", reject);
  child.on("close", (code) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(stderr.trim() || `Cutout process exited with code ${code}.`)); });
}

async function encodeArtifacts(work: string, destination: string) {
  const frames = join(work, "transparent", "%06d.png");
  await mkdir(destination, { recursive: true });
  await command(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(cutoutFps), "-start_number", "0", "-i", frames, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "18", join(destination, "preview.webm")], {});
  await command(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(cutoutFps), "-start_number", "0", "-i", frames, "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(destination, "render.mov")], {});
}

async function command(executable: string, args: string[], options: { env?: NodeJS.ProcessEnv }) {
  return execFile(executable, args, { ...options, maxBuffer: 10_000_000, timeout: 30 * 60_000 });
}

function recipe(project: VideoProject, overlay: SubjectCutoutOverlay) {
  return { version: 1, provider: overlay.processing.provider, providerVersion: overlay.processing.providerVersion, projectId: project.id, overlayId: overlay.id, sourceId: overlay.sourceId, sourceStart: overlay.sourceStart, sourceEnd: overlay.sourceEnd, fps: cutoutFps, modelHome: "runtime/rembg/models", createdAt: new Date().toISOString() };
}

function relativeArtifacts(id: string): CutoutArtifacts {
  const root = `derived/cutouts/${id}`;
  return { previewPath: `${root}/preview.webm`, renderPath: `${root}/render.mov`, recipePath: `${root}/recipe.json` };
}

function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-cutout", event, ...details })); }

export type CutoutArtifacts = { previewPath: string; renderPath: string; recipePath: string };

import { execFile as execFileCallback, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SubjectCutoutOverlay, VideoProject } from "../src/analysis-model";
import { mediaSourcePath } from "./ReferenceMediaCache";
import { runtimeRoot } from "./media-analysis";
import { projectDirectory } from "./project-store";

const execFile = promisify(execFileCallback);
const ffmpegPath = process.env.CUTROOM_FFMPEG || "ffmpeg";
const rembgPythonPath = process.env.CUTROOM_REMBG_PYTHON || join(runtimeRoot, "runtime/rembg/.venv/bin/python");
const rembgModelRoot = process.env.CUTROOM_REMBG_MODELS || join(runtimeRoot, "runtime/rembg/models");
const pythonScript = fileURLToPath(new URL("../scripts/RemoveVideoBackground.py", import.meta.url));
const cutoutFps = 30;
