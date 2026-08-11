export async function addRemoteReference(input: AddRemoteReferenceInput): Promise<VideoMediaSource> {
  log("reference_media_import_started", { projectId: input.projectId, url: input.url });
  if (!input.label.trim()) throw new Error("Reference media label is required.");
  await readStoredProject(input.projectId);
  const downloaded = await downloadRemoteMedia(input.url);
  const project = await readStoredProject(input.projectId);
  const source = remoteSource(input, downloaded);
  const sources = replaceSource(project.mediaLibrary.sources, source);
  await writeStoredProject({ ...project, mediaLibrary: { ...project.mediaLibrary, sources } });
  return source;
}

export async function regenerateRemoteReference(projectId: string, sourceId: string): Promise<VideoMediaSource> {
  log("reference_media_regeneration_started", { projectId, sourceId });
  const project = await readStoredProject(projectId);
  const existing = project.mediaLibrary.sources.find((source) => source.id === sourceId);
  if (!existing || existing.origin.type !== "remote") throw new Error(`Unknown remote media source: ${sourceId}`);
  const downloaded = await downloadRemoteMedia(existing.origin.url);
  const latest = await readStoredProject(projectId);
  const source = { ...existing, cache: downloaded.cache, metadata: downloaded.metadata };
  await writeStoredProject({ ...latest, mediaLibrary: { ...latest.mediaLibrary, sources: replaceSource(latest.mediaLibrary.sources, source) } });
  return source;
}

export async function removeRemoteReference(projectId: string, sourceId: string) {
  log("reference_media_remove_started", { projectId, sourceId });
  const project = await readStoredProject(projectId);
  if (sourceId === project.mediaLibrary.primarySourceId) throw new Error("The primary media source cannot be removed.");
  if (project.programTimeline.clips.some((clip) => clip.sourceId === sourceId)) throw new Error("Remove this source's program clips before removing the media source.");
  const sources = project.mediaLibrary.sources.filter((source) => source.id !== sourceId);
  if (sources.length === project.mediaLibrary.sources.length) throw new Error(`Unknown media source: ${sourceId}`);
  await writeStoredProject({ ...project, mediaLibrary: { ...project.mediaLibrary, sources } });
  return { projectId, sourceId, removedAt: new Date().toISOString() };
}

export function mediaSourcePath(source: VideoMediaSource): string {
  if (source.rawMediaId) return resolveRawMediaPath(source.rawMediaId);
  if (source.origin.type === "local") return source.origin.path;
  if (!source.cache) throw new Error(`Reference cache is missing for ${source.id}. Regenerate it from ${source.origin.url}.`);
  return join(runtimeRoot, source.cache.relativePath);
}

export function remoteMediaId(url: string): string {
  return `media.reference.${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

async function downloadRemoteMedia(url: string): Promise<DownloadedMedia> {
  assertRemoteUrl(url);
  await assertRuntimeStorageAvailable();
  await mkdir(join(runtimeRoot, "cache", "media"), { recursive: true });
  const temporary = join(runtimeRoot, "cache", "media", `.download-${randomUUID()}.part`);
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`Reference download failed with HTTP ${response.status}.`);
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporary));
    return finalizeDownload(temporary, url, response.headers.get("content-type"));
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function finalizeDownload(temporary: string, url: string, contentType: string | null): Promise<DownloadedMedia> {
  const { sha256, bytes } = await digestFile(temporary);
  const metadata = await probeVideo(temporary);
  const relativePath = `cache/media/${sha256}.${mediaExtension(url, contentType)}`;
  const finalPath = join(runtimeRoot, relativePath);
  if (await exists(finalPath)) await unlink(temporary); else await rename(temporary, finalPath);
  return { cache: { relativePath, sha256, bytes, cachedAt: new Date().toISOString() }, metadata };
}

async function digestFile(path: string) {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return { sha256: hash.digest("hex"), bytes: (await stat(path)).size };
}

async function probeVideo(path: string): Promise<VideoMediaMetadata> {
  const { stdout } = await execFile(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]);
  const probe = JSON.parse(stdout) as ProbeResult;
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (!video?.width || !video.height) throw new Error("Downloaded reference has no readable video stream.");
  return { duration: Number(probe.format.duration), width: video.width, height: video.height, averageFps: parseRate(video.avg_frame_rate), videoCodec: video.codec_name, audioCodec: audio?.codec_name || null, container: probe.format.format_name };
}

function remoteSource(input: AddRemoteReferenceInput, downloaded: DownloadedMedia): VideoMediaSource {
  return { id: remoteMediaId(input.url), kind: "video", role: "reference", label: input.label.trim(), rawMediaId: null, origin: { type: "remote", url: input.url }, cache: downloaded.cache, metadata: downloaded.metadata, createdAt: new Date().toISOString() };
}

function replaceSource(sources: VideoMediaSource[], source: VideoMediaSource) {
  const retained = sources.filter((existing) => existing.id !== source.id);
  return [...retained, source];
}

function mediaExtension(url: string, contentType: string | null): "mov" | "mp4" | "m4v" {
  const extension = extname(new URL(url).pathname).slice(1).toLowerCase();
  if (extension === "mov" || extension === "mp4" || extension === "m4v") return extension;
  return contentType?.includes("quicktime") ? "mov" : "mp4";
}

function assertRemoteUrl(url: string) {
  if (!/^https?:\/\//.test(url)) throw new Error("Reference media URL must use HTTP or HTTPS.");
}

function parseRate(value = "0/1") {
  const [numerator, denominator] = value.split("/").map(Number);
  return denominator ? numerator / denominator : 0;
}

async function exists(path: string) {
  try { await access(path); return true; } catch { return false; }
}

function log(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "cutroom-reference-media", event, ...details }));
}

type AddRemoteReferenceInput = { projectId: string; url: string; label: string };
type DownloadedMedia = { cache: RemoteMediaCache; metadata: VideoMediaMetadata };
type ProbeStream = { codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string };
type ProbeResult = { streams: ProbeStream[]; format: { duration: string; format_name: string } };

import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, stat, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { RemoteMediaCache, VideoMediaMetadata, VideoMediaSource } from "../src/analysis-model";
import { assertRuntimeStorageAvailable, runtimeRoot } from "./RuntimeStorage";
import { readStoredProject, writeStoredProject } from "./project-store";
import { resolveRawMediaPath } from "./RawMediaLibrary";

const execFile = promisify(execFileCallback);
const ffprobePath = process.env.CUTROOM_FFPROBE || "/opt/homebrew/bin/ffprobe";
