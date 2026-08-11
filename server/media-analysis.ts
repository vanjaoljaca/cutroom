export async function analyzeSource(sourcePath: string): Promise<AnalysisResult> {
  await assertRuntimeReady();
  const job = join(runtimeRoot, "jobs", `${Date.now()}-${randomUUID()}`);
  await mkdir(job, { recursive: true });
  const audio = join(job, "audio.wav");
  const transcript = join(job, "transcript.json");
  await extractAudio(sourcePath, audio);
  await transcribe(audio, transcript);
  return buildAnalysis(sourcePath, transcript, job);
}

async function assertRuntimeReady() {
  await assertRuntimeStorageAvailable();
  await Promise.all([access(cliPath), access(modelPath)]);
  const storage = await statfs(runtimeRoot);
  if (storage.bavail * storage.bsize < 120_000_000) throw new Error("Not enough free USB space for an analysis job.");
}

async function extractAudio(input: string, output: string) {
  await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output]);
  log("audio_extracted", { output });
}

async function transcribe(audio: string, output: string) {
  const args = ["transcribe", audio, "--model-version", "v2", "--model-dir", modelPath, "--word-timestamps", "--metadata", "--output-json", output];
  await run(cliPath, args, 300_000);
  log("transcription_completed", { output, model: "parakeet-tdt-0.6b-v2" });
}

async function buildAnalysis(source: string, transcriptPath: string, job: string) {
  const transcript = JSON.parse(await readFile(transcriptPath, "utf8")) as FluidTranscript;
  const duration = await probeDuration(source);
  return { ...interpretDirectorTrack(transcript, duration), artifactsDirectory: job };
}

async function probeDuration(input: string): Promise<number> {
  const { stdout } = await run(ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", input]);
  return Number(stdout.trim());
}

function run(command: string, args: string[], timeout = 60_000) {
  return execFile(command, args, { maxBuffer: 4 * 1024 * 1024, timeout });
}

function log(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "cutroom-analysis", event, ...details }));
}

const cliPath = process.env.CUTROOM_TRANSCRIBER || join(runtimeRoot, "runtime/FluidAudio-build/arm64-apple-macosx/release/fluidaudiocli");
const modelPath = transcriptionModelPath;
const ffmpegPath = process.env.CUTROOM_FFMPEG || "/opt/homebrew/bin/ffmpeg";
const ffprobePath = process.env.CUTROOM_FFPROBE || "/opt/homebrew/bin/ffprobe";

type FluidTranscript = { text: string; wordTimings: import("../src/analysis-model").WordTiming[] };

import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readFile, statfs } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AnalysisResult } from "../src/analysis-model";
import { interpretDirectorTrack } from "./director-analysis";
import { assertRuntimeStorageAvailable, projectsRoot, runtimeRoot, transcriptionModelPath } from "./RuntimeStorage";

export { projectsRoot, runtimeRoot } from "./RuntimeStorage";

const execFile = promisify(execFileCallback);
