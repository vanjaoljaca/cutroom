export async function analyzeProjectPitch(projectId: string): Promise<PitchArtifact> {
  const project = await readStoredProject(projectId);
  const audioPath = await projectAudioPath(project);
  const decoded = decodePcmWave(await readFile(audioPath));
  const points = detectPitch(decoded.samples, decoded.sampleRate);
  const artifact = makeArtifact(projectId, audioPath, decoded.sampleRate, points);
  await writePitchArtifact(projectId, artifact);
  await writePitchReference(project, artifact);
  log("pitch_analysis_completed", { projectId, points: points.length, voiced: points.filter((point) => point.hz !== null).length, audioPath });
  return artifact;
}

export async function readPitchArtifact(projectId: string): Promise<PitchArtifact> {
  const project = await readStoredProject(projectId);
  if (!project.pitchAnalysis) throw new PitchUnavailableError(projectId);
  const path = join(projectDirectory(projectId), project.pitchAnalysis.artifactPath);
  return validatePitchArtifact(JSON.parse(await readFile(path, "utf8")) as PitchArtifact, projectId);
}

async function projectAudioPath(project: VideoProject): Promise<string> {
  const reused = resolveReusableAudio(project.artifactsDirectory);
  if (reused && await exists(reused)) return reused;
  const output = join(projectDirectory(project.id), "analysis", "pitch-audio.wav");
  await mkdir(dirname(output), { recursive: true });
  await execFile(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-i", project.sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output], { timeout: 120_000 });
  log("pitch_audio_extracted", { projectId: project.id, output });
  return output;
}

function resolveReusableAudio(artifactsDirectory: string): string | null {
  if (!artifactsDirectory) return null;
  const directory = resolve(artifactsDirectory);
  return directory.startsWith(`${resolve(runtimeRoot)}${sep}`) ? join(directory, "audio.wav") : null;
}

async function writePitchArtifact(projectId: string, artifact: PitchArtifact) {
  const directory = join(projectDirectory(projectId), "analysis");
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `pitch-${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(validatePitchArtifact(artifact, projectId))}\n`);
  await rename(temporary, join(directory, "pitch-v2.json"));
}

async function writePitchReference(project: VideoProject, artifact: PitchArtifact) {
  const voicedPointCount = artifact.points.filter((point) => point.hz !== null).length;
  const pitchAnalysis: PitchAnalysisReference = { version: 2, artifactPath: "analysis/pitch-v2.json", algorithm: artifact.algorithm, algorithmVersion: artifact.algorithmVersion, sampleRate: artifact.sampleRate, windowSize: artifact.windowSize, hopSize: artifact.hopSize, confidenceThreshold: artifact.confidenceThreshold, pointCount: artifact.points.length, voicedPointCount, generatedAt: artifact.generatedAt };
  const latest = await readStoredProject(project.id);
  await writeStoredProject({ ...latest, pitchAnalysis });
}

function makeArtifact(projectId: string, audioPath: string, sampleRate: number, points: PitchPoint[]): PitchArtifact {
  return { schemaVersion: 2, projectId, sourceAudio: relative(runtimeRoot, audioPath), algorithm: "normalized-autocorrelation", algorithmVersion: "1.1.0", sampleRate, windowSize: defaultPitchConfig.windowSize, hopSize: defaultPitchConfig.hopSize, minHz: defaultPitchConfig.minHz, maxHz: defaultPitchConfig.maxHz, confidenceThreshold: defaultPitchConfig.confidenceThreshold, generatedAt: new Date().toISOString(), points };
}

function decodePcmWave(buffer: Buffer): DecodedWave {
  assert(buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE", "Pitch audio is not a WAV file.");
  const format = findChunk(buffer, "fmt ");
  const data = findChunk(buffer, "data");
  assert(buffer.readUInt16LE(format.offset) === 1 && buffer.readUInt16LE(format.offset + 2) === 1, "Pitch audio must be mono PCM.");
  assert(buffer.readUInt16LE(format.offset + 14) === 16, "Pitch audio must be 16-bit PCM.");
  const sampleRate = buffer.readUInt32LE(format.offset + 4);
  const samples = new Float64Array(Math.floor(data.length / 2));
  for (let index = 0; index < samples.length; index += 1) samples[index] = buffer.readInt16LE(data.offset + index * 2) / 32768;
  return { sampleRate, samples };
}

function findChunk(buffer: Buffer, name: string): WaveChunk {
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const length = buffer.readUInt32LE(offset + 4);
    if (buffer.toString("ascii", offset, offset + 4) === name) return { offset: offset + 8, length };
    offset += 8 + length + (length % 2);
  }
  throw new Error(`Missing WAV chunk: ${name}`);
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function log(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "cutroom-pitch", event, ...details }));
}

export class PitchUnavailableError extends Error {
  constructor(projectId: string) { super(`Pitch analysis is unavailable for project: ${projectId}`); }
}

type DecodedWave = { sampleRate: number; samples: Float64Array };
type WaveChunk = { offset: number; length: number };

import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { PitchAnalysisReference, VideoProject } from "../src/analysis-model";
import type { PitchArtifact, PitchPoint } from "../src/PitchModel";
import { defaultPitchConfig, detectPitch } from "./PitchDetector";
import { runtimeRoot } from "./media-analysis";
import { projectDirectory, readStoredProject, writeStoredProject } from "./project-store";
import { validatePitchArtifact } from "./pitch-schema";

const execFile = promisify(execFileCallback);
const ffmpegPath = process.env.CUTROOM_FFMPEG || "ffmpeg";
