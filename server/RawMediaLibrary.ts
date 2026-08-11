export async function ingestRawMedia(intakePath: string): Promise<RawMediaRecord> {
  await assertRuntimeStorageAvailable();
  assertAbsolutePath(intakePath);
  const digest = await digestFile(intakePath);
  const existing = (await readRawMediaLibrary()).records.find((record) => record.sha256 === digest.sha256);
  if (existing) { await access(existing.usbPath); return existing; }
  const record = await createRawMediaRecord(intakePath, digest);
  await updateLibrary((library) => ({ ...library, records: [...library.records, record] }));
  log("raw_media_ingested", { rawMediaId: record.id, sha256: record.sha256, bytes: record.bytes });
  return record;
}

export async function attachRawMedia(input: AttachRawMediaInput): Promise<VideoProject> {
  const record = await rawMediaRecord(input.rawMediaId);
  const project = await readStoredProject(input.projectId);
  const source = sourceFromRaw(record, input, project.createdAt);
  const sources = [...project.mediaLibrary.sources.filter((item) => item.id !== source.id), source];
  const primarySourceId = input.primary ? source.id : project.mediaLibrary.primarySourceId;
  const saved = await writeStoredProject({ ...project, mediaLibrary: { ...project.mediaLibrary, primarySourceId, sources } });
  await setProjectReference(record.id, saved.id, true);
  log("raw_media_attached", { projectId: saved.id, rawMediaId: record.id, sourceId: source.id, primary: input.primary });
  return saved;
}

export async function detachRawMedia(projectId: string, rawMediaId: string): Promise<VideoProject> {
  const project = await readStoredProject(projectId);
  const ids = project.mediaLibrary.sources.filter((source) => source.rawMediaId === rawMediaId).map((source) => source.id);
  assertDetachable(project, ids);
  const saved = await writeStoredProject({ ...project, mediaLibrary: { ...project.mediaLibrary, sources: project.mediaLibrary.sources.filter((source) => !ids.includes(source.id)) } });
  await setProjectReference(rawMediaId, projectId, false);
  log("raw_media_detached", { projectId, rawMediaId, sourceIds: ids });
  return saved;
}

export async function readRawMediaLibrary(): Promise<RawMediaLibrary> {
  await assertRuntimeStorageAvailable();
  try { return validateRawMediaLibrary(JSON.parse(await readFile(rawMediaManifestPath, "utf8")) as RawMediaLibrary); }
  catch (error) { if (isMissing(error)) return { version: 1, records: [] }; throw error; }
}

export function resolveRawMediaPath(rawMediaId: string): string {
  assertRuntimeStorageAvailableSync();
  const library = validateRawMediaLibrary(JSON.parse(readFileSync(rawMediaManifestPath, "utf8")) as RawMediaLibrary);
  const record = library.records.find((candidate) => candidate.id === rawMediaId);
  if (!record) throw new Error(`Unknown raw media record: ${rawMediaId}`);
  return record.usbPath;
}

export function validateRawMediaLibrary(library: RawMediaLibrary): RawMediaLibrary {
  if (library.version !== 1 || !Array.isArray(library.records)) throw new Error("Unsupported raw media library.");
  const ids = new Set<string>();
  library.records.forEach((record) => validateRawMediaRecord(record, ids));
  return library;
}

async function createRawMediaRecord(intakePath: string, digest: FileDigest): Promise<RawMediaRecord> {
  const originalFilename = basename(intakePath);
  const directory = join(rawMediaRoot, digest.sha256);
  const usbPath = join(directory, originalFilename);
  await mkdir(directory, { recursive: true });
  if (!(await exists(usbPath))) await copyFile(intakePath, usbPath);
  return { id: `raw.${digest.sha256.slice(0, 16)}`, sha256: digest.sha256, originalFilename, intakePath, usbPath, bytes: digest.bytes, ingestedAt: new Date().toISOString(), metadata: await probeRawMedia(usbPath), projectIds: [] };
}

async function rawMediaRecord(id: string): Promise<RawMediaRecord> {
  const record = (await readRawMediaLibrary()).records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Unknown raw media record: ${id}`);
  await access(record.usbPath);
  return record;
}

async function setProjectReference(rawMediaId: string, projectId: string, attached: boolean) {
  await updateLibrary((library) => ({ ...library, records: library.records.map((record) => record.id === rawMediaId ? { ...record, projectIds: attached ? [...new Set([...record.projectIds, projectId])].sort() : record.projectIds.filter((id) => id !== projectId) } : record) }));
}

async function updateLibrary(change: (library: RawMediaLibrary) => RawMediaLibrary) {
  await mkdir(rawMediaRoot, { recursive: true });
  const next = validateRawMediaLibrary(change(await readRawMediaLibrary()));
  const temporary = `${rawMediaManifestPath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
  await rename(temporary, rawMediaManifestPath);
}

async function digestFile(path: string): Promise<FileDigest> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return { sha256: hash.digest("hex"), bytes: (await stat(path)).size };
}

async function probeRawMedia(path: string): Promise<RawMediaMetadata> {
  const { stdout } = await execFile(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]);
  const probe = JSON.parse(stdout) as ProbeResult;
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (!video?.width || !video.height) throw new Error("Raw media has no readable video stream.");
  return { duration: Number(probe.format.duration), container: extension(path), videoCodec: video.codec_name, width: video.width, height: video.height, frameRate: video.avg_frame_rate || "0/1", audioCodec: audio?.codec_name || null, audioSampleRate: audio?.sample_rate ? Number(audio.sample_rate) : null, audioChannels: audio?.channels || null, bitRate: Number(probe.format.bit_rate || 0) };
}

function sourceFromRaw(record: RawMediaRecord, input: AttachRawMediaInput, createdAt: string): VideoMediaSource {
  const metadata = record.metadata;
  const [top, bottom] = metadata.frameRate.split("/").map(Number);
  return { id: input.sourceId || `media.raw.${record.sha256.slice(0, 16)}`, kind: "video", role: input.role, label: input.label || record.originalFilename, rawMediaId: record.id, origin: { type: "local", path: record.usbPath }, cache: null, metadata: { duration: metadata.duration, width: metadata.width, height: metadata.height, averageFps: bottom ? top / bottom : top, videoCodec: metadata.videoCodec, audioCodec: metadata.audioCodec, container: metadata.container }, createdAt };
}

function assertDetachable(project: VideoProject, sourceIds: string[]) {
  if (!sourceIds.length) throw new Error("Project does not reference that raw media record.");
  if (sourceIds.includes(project.mediaLibrary.primarySourceId)) throw new Error("The primary raw media reference cannot be detached.");
  if (project.programTimeline.clips.some((clip) => sourceIds.includes(clip.sourceId))) throw new Error("Remove program clips using this raw media before detaching it.");
  if (project.cutoutOverlays.some((overlay) => sourceIds.includes(overlay.sourceId)) || project.videoOverlays.some((overlay) => sourceIds.includes(overlay.sourceId))) throw new Error("Remove overlays using this raw media before detaching it.");
}

function validateRawMediaRecord(record: RawMediaRecord, ids: Set<string>) {
  if (!/^raw\.[a-f0-9]{16}$/.test(record.id) || ids.has(record.id)) throw new Error(`Invalid raw media id: ${record.id}`);
  if (!/^[a-f0-9]{64}$/.test(record.sha256) || record.id !== `raw.${record.sha256.slice(0, 16)}`) throw new Error(`Invalid raw media digest: ${record.id}`);
  if (!record.usbPath.startsWith(`${rawMediaRoot}/`) || record.bytes <= 0 || !record.originalFilename) throw new Error(`Invalid raw media path: ${record.id}`);
  if (!(record.metadata.duration > 0) || !(record.metadata.width > 0) || !(record.metadata.height > 0)) throw new Error(`Invalid raw media metadata: ${record.id}`);
  if (!record.projectIds.every((id) => /^[a-z0-9-]+$/.test(id))) throw new Error(`Invalid raw media project links: ${record.id}`);
  ids.add(record.id);
}

function extension(path: string) { return extname(path).slice(1).toLowerCase() || "mov"; }
function assertAbsolutePath(path: string) { if (!path.startsWith("/")) throw new Error("Raw media intake path must be absolute."); }
function isMissing(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }
async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-raw-media", event, ...details })); }

export type AttachRawMediaInput = { projectId: string; rawMediaId: string; sourceId?: string; role: VideoMediaSource["role"]; label?: string; primary: boolean };
type FileDigest = { sha256: string; bytes: number };
type ProbeResult = { streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string; sample_rate?: string; channels?: number }>; format: { duration: string; bit_rate?: string } };

import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import type { RawMediaLibrary, RawMediaMetadata, RawMediaRecord, VideoMediaSource, VideoProject } from "../src/analysis-model";
import { assertRuntimeStorageAvailable, assertRuntimeStorageAvailableSync, runtimeRoot } from "./RuntimeStorage";
import { readStoredProject, writeStoredProject } from "./project-store";

const execFile = promisify(execFileCallback);
const rawMediaRoot = join(runtimeRoot, "raw-videos");
const rawMediaManifestPath = join(rawMediaRoot, "raw-media.json");
const ffprobePath = process.env.CUTROOM_FFPROBE || "/opt/homebrew/bin/ffprobe";
