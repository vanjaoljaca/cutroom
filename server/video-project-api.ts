export function videoProjectPlugin(): Plugin {
  return {
    name: "cutroom-video-projects",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!handleVideoProjectRequest(request, response)) next();
      });
    },
  };
}

export function handleVideoProjectRequest(request: IncomingMessage, response: ServerResponse): boolean {
  const route = parseRoute(request.url);
  if (!route) return false;
  void handleProjectRequest(route, request, response);
  return true;
}

async function handleProjectRequest(route: ProjectRoute, request: IncomingMessage, response: ServerResponse) {
  try {
    if (route.action === "catalog" && request.method === "GET") return sendJson(response, 200, await listProjects());
    if (route.action === "references" && request.method === "GET") return sendJson(response, 200, await readReferenceMediaLibrary());
    if (route.action === "raw-media" && request.method === "GET") return sendJson(response, 200, await readRawMediaLibrary());
    if (route.action === "raw-media" && request.method === "POST") return sendJson(response, 201, await ingestRawMedia((JSON.parse(await readBody(request)) as { path: string }).path));
    if (route.action === "raw-media-attach" && request.method === "POST") return sendJson(response, 200, await attachRawMediaInput(route.id, request));
    if (route.action === "raw-media-attach" && route.itemId && request.method === "DELETE") return sendJson(response, 200, await detachRawMedia(route.id, route.itemId));
    if (route.action === "media" && request.method === "GET") return serveMedia(route.id, request, response);
    if (route.action === "media-references" && request.method === "POST") return sendJson(response, 201, await addReferenceMedia(route.id, request));
    if (route.action === "media-source" && route.itemId && request.method === "GET") return serveMediaSource(route.id, route.itemId, request, response);
    if (route.action === "media-transcript" && route.itemId && request.method === "GET") return serveMediaTranscript(route.id, route.itemId, response);
    if (route.action === "media-source" && route.itemId && request.method === "DELETE") return sendJson(response, 200, await removeRemoteReference(route.id, route.itemId));
    if (route.action === "media-cache" && route.itemId && request.method === "POST") return sendJson(response, 200, await regenerateRemoteReference(route.id, route.itemId));
    if (route.action === "cutouts" && request.method === "POST") return sendJson(response, 202, await startCutoutJob(route.id, await cutoutInput(request)));
    if (route.action === "cutout-job" && route.itemId && request.method === "GET") return sendJson(response, 200, await durableCutoutJobStatus(route.id, route.itemId));
    if (route.action === "cutout-job" && route.itemId && request.method === "DELETE") return sendJson(response, 200, await cancelCutoutJob(route.id, route.itemId));
    if (route.action === "cutout-preview" && route.itemId && request.method === "GET") return serveCutoutPreview(route.id, route.itemId, request, response);
    if (route.action === "subject-track-crop" && route.itemId && request.method === "PATCH") return sendJson(response, 200, await updateSubjectTrackCrop(route.id, route.itemId, request));
    if (route.action === "subject-track-audio" && route.itemId && request.method === "PATCH") return sendJson(response, 200, await updateSubjectTrackAudio(route.id, route.itemId, request));
    if (route.action === "asset" && route.itemId && request.method === "GET") return serveAsset(route.id, route.itemId, response);
    if (route.action === "pitch" && request.method === "GET") return sendJson(response, 200, await readPitchArtifact(route.id));
    if (route.action === "pitch" && request.method === "POST") return sendJson(response, 200, await analyzeProjectPitch(route.id));
    if (route.action === "subtitles" && request.method === "POST") return sendJson(response, 200, await subtitleCollection(route.id, request));
    if (route.action === "subtitle-cue" && route.itemId && request.method === "PATCH") return sendJson(response, 200, await editSubtitle(route.id, route.itemId, JSON.parse(await readBody(request)) as SubtitleEditInput));
    if (route.action === "subtitle-cue" && route.itemId && request.method === "DELETE") return sendJson(response, 200, await removeSubtitle(route.id, route.itemId, revisionInput(await readBody(request))));
    if (route.action === "subtitle-cue" && route.itemId && request.method === "POST") return sendJson(response, 200, await restoreSubtitle(route.id, route.itemId, revisionInput(await readBody(request))));
    if (route.action === "exports" && request.method === "GET") return sendJson(response, 200, await exportOverview(route.id));
    if (route.action === "exports" && request.method === "POST") return sendJson(response, 202, await startExportJob(route.id, await exportPreset(request)));
    if (route.action === "export-job" && route.itemId && request.method === "GET") return sendJson(response, 200, exportJobStatus(route.id, route.itemId));
    if (route.action === "export-job" && route.itemId && request.method === "DELETE") return sendJson(response, 200, cancelExportJob(route.id, route.itemId));
    if (route.action === "export-file" && route.itemId && request.method === "GET") return serveExport(route.id, route.itemId, request, response);
    if (route.action !== "project") return sendJson(response, 405, { error: "Unsupported project operation." });
    if (request.method === "GET") return sendJson(response, 200, await readStoredProject(route.id));
    if (request.method === "PUT") return sendJson(response, 200, await updateProject(route.id, request));
    if (request.method === "PATCH") return sendJson(response, 200, await renameStoredProject(route.id, request));
    if (request.method === "DELETE") return sendJson(response, 200, await trashStoredProject(route.id, request));
    sendJson(response, 405, { error: "Unsupported project operation." });
  } catch (error) {
    log("project_request_failed", { id: route.id, error: error instanceof Error ? error.message : String(error) });
    sendJson(response, error instanceof ProjectRevisionConflict ? 409 : 500, { error: error instanceof Error ? error.message : "Project request failed." });
  }
}

async function updateProject(id: string, request: IncomingMessage) {
  const project = validateVideoProject(JSON.parse(await readBody(request)) as VideoProject);
  if (project.id !== id) throw new Error("Project id does not match route.");
  const saved = await writeStoredProject(project);
  log("project_saved", { id });
  return saved;
}

async function subtitleCollection(id: string, request: IncomingMessage) {
  const input = JSON.parse(await readBody(request)) as { operation?: string; revision?: number; dryRun?: boolean; cues?: SubtitleCue[] };
  if (input.operation === "generate" && input.dryRun) return previewGeneratedSubtitles(id);
  if (input.operation === "generate" && Number.isInteger(input.revision)) return generateSubtitles(id, input.revision!);
  if (input.operation === "import" && Number.isInteger(input.revision) && Array.isArray(input.cues)) return importSubtitles(id, input.revision!, input.cues);
  throw new Error("Subtitle operation requires generate/import and a valid revision.");
}

function revisionInput(body: string) { const revision = (JSON.parse(body) as { revision?: number }).revision; if (!Number.isInteger(revision)) throw new Error("Subtitle revision is required."); return revision!; }

async function renameStoredProject(id: string, request: IncomingMessage) {
  const input = JSON.parse(await readBody(request)) as { title?: string; revision?: number };
  if (typeof input.title !== "string" || !Number.isInteger(input.revision)) throw new Error("Project name and revision are required.");
  return renameProject({ projectId: id, title: input.title, revision: input.revision! });
}

async function trashStoredProject(id: string, request: IncomingMessage) {
  const input = JSON.parse(await readBody(request)) as { revision?: number };
  if (!Number.isInteger(input.revision)) throw new Error("Project revision is required.");
  return trashProject({ projectId: id, revision: input.revision! });
}

async function exportPreset(request: IncomingMessage): Promise<ExportPreset> {
  const body = await readBody(request);
  const preset = body ? (JSON.parse(body) as { preset?: string }).preset : "original-format";
  if (preset !== "original-format" && preset !== "tiktok-60" && preset !== "tiktok-software" && preset !== "lan-review") throw new Error(`Unsupported export preset: ${preset}`);
  return preset;
}

async function addReferenceMedia(projectId: string, request: IncomingMessage) {
  const input = JSON.parse(await readBody(request)) as { referenceId?: string; revision?: number; url?: string; label?: string; cachePath?: string; transcriptPath?: string };
  if (input.referenceId && Number.isInteger(input.revision)) return attachLibraryReference({ projectId, referenceId: input.referenceId, revision: input.revision! });
  if (typeof input.url !== "string" || typeof input.label !== "string") throw new Error("Reference URL and label are required.");
  if (input.cachePath) return attachCachedRemoteReference({ projectId, url: input.url, label: input.label, path: input.cachePath, transcriptPath: input.transcriptPath });
  return addRemoteReference({ projectId, url: input.url, label: input.label });
}

async function attachRawMediaInput(projectId: string, request: IncomingMessage) {
  const input = JSON.parse(await readBody(request)) as { rawMediaId?: string; sourceId?: string; role?: string; label?: string; primary?: boolean };
  if (!input.rawMediaId || !input.role || !["instruction", "creator", "reference"].includes(input.role)) throw new Error("Raw media id and role are required.");
  return attachRawMedia({ projectId, rawMediaId: input.rawMediaId, sourceId: input.sourceId, role: input.role as "instruction" | "creator" | "reference", label: input.label, primary: Boolean(input.primary) });
}

async function cutoutInput(request: IncomingMessage): Promise<CreateCutoutInput> {
  const input = JSON.parse(await readBody(request)) as CreateCutoutInput;
  if (!input.sourceId || !input.targetClipId || !input.label || !(input.sourceEnd > input.sourceStart)) throw new Error("Cutout source, target, label, and interval are required.");
  return input;
}

async function updateSubjectTrackCrop(projectId: string, subjectTrackId: string, request: IncomingMessage) {
  const input = JSON.parse(await readBody(request)) as { revision?: number; crop?: CutoutCrop };
  if (!Number.isInteger(input.revision) || !input.crop) throw new Error("Subject track revision and crop are required.");
  return setSubjectTrackCrop({ projectId, subjectTrackId, revision: input.revision!, crop: input.crop });
}

async function updateSubjectTrackAudio(projectId: string, subjectTrackId: string, request: IncomingMessage) {
  const input = JSON.parse(await readBody(request)) as { revision?: number; sourceId?: string; volume?: number; muted?: boolean };
  if (!Number.isInteger(input.revision) || !input.sourceId || typeof input.volume !== "number" || typeof input.muted !== "boolean") throw new Error("Subject track revision, source, volume, and mute are required.");
  return setSubjectTrackAudio({ projectId, subjectTrackId, revision: input.revision!, sourceId: input.sourceId, volume: input.volume, muted: input.muted });
}

async function serveMedia(id: string, request: IncomingMessage, response: ServerResponse) {
  const project = await readStoredProject(id);
  const source = project.mediaLibrary.sources.find((item) => item.id === project.mediaLibrary.primarySourceId);
  if (!source) throw new Error("Primary media source is missing.");
  return serveVideoPath(mediaSourcePath(source), request, response);
}

async function serveMediaSource(id: string, sourceId: string, request: IncomingMessage, response: ServerResponse) {
  const project = await readStoredProject(id);
  const source = project.mediaLibrary.sources.find((item) => item.id === sourceId);
  if (!source) throw new Error(`Unknown media source: ${sourceId}`);
  return serveVideoPath(mediaSourcePath(source), request, response);
}

async function serveMediaTranscript(id: string, sourceId: string, response: ServerResponse) {
  const project = await readStoredProject(id);
  const source = project.mediaLibrary.sources.find((item) => item.id === sourceId);
  if (!source?.transcript) throw new Error(`Transcript is unavailable for media source: ${sourceId}`);
  const body = await readFile(join(runtimeRoot, source.transcript.artifactPath));
  response.writeHead(200, { "content-type": "application/json", "content-length": body.length, "cache-control": "no-store" });
  response.end(body);
}

async function serveAsset(id: string, assetId: string, response: ServerResponse) {
  const project = await readStoredProject(id);
  const asset = project.assetLibrary.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error(`Unknown asset: ${assetId}`);
  const path = join(projectsRoot, id, asset.relativePath);
  const info = await stat(path);
  response.writeHead(200, { "content-length": info.size, "content-type": asset.mimeType, "cache-control": "no-store" });
  createReadStream(path).pipe(response);
}

async function serveCutoutPreview(id: string, overlayId: string, request: IncomingMessage, response: ServerResponse) {
  const project = await readStoredProject(id);
  const overlay = project.cutoutOverlays.find((candidate) => candidate.id === overlayId);
  if (!overlay?.processing.previewPath) throw new Error(`Cutout preview is unavailable: ${overlayId}`);
  return serveVideoPath(join(projectDirectory(id), overlay.processing.previewPath), request, response);
}

async function serveExport(id: string, jobId: string, request: IncomingMessage, response: ServerResponse) {
  const project = await readStoredProject(id);
  const receipt = project.exportHistory.find((item) => item.jobId === jobId);
  if (!receipt) throw new Error(`Unknown completed export: ${jobId}`);
  return serveVideoPath(join(projectDirectory(id), receipt.outputPath), request, response, basename(receipt.outputPath));
}

async function serveVideoPath(path: string, request: IncomingMessage, response: ServerResponse, downloadName?: string) {
  const info = await stat(path);
  const range = parseRange(request.headers.range, info.size);
  response.writeHead(range ? 206 : 200, mediaHeaders(path, info.size, range, downloadName));
  createReadStream(path, range ? { start: range.start, end: range.end } : undefined).pipe(response);
}

function parseRoute(rawUrl = "/"): ProjectRoute | null {
  const path = new URL(rawUrl, "http://cutroom.local").pathname;
  if (path === "/api/projects") return { id: "", action: "catalog", itemId: null };
  if (path === "/api/references") return { id: "", action: "references", itemId: null };
  if (path === "/api/raw-media") return { id: "", action: "raw-media", itemId: null };
  const rawMedia = path.match(/^\/api\/projects\/([a-z0-9-]+)\/media\/raw(?:\/(raw\.[a-f0-9]{16}))?$/);
  if (rawMedia) return { id: rawMedia[1], action: "raw-media-attach", itemId: rawMedia[2] || null };
  const references = path.match(/^\/api\/projects\/([a-z0-9-]+)\/media\/references$/);
  if (references) return { id: references[1], action: "media-references", itemId: null };
  const preview = path.match(/^\/api\/projects\/([a-z0-9-]+)\/cutouts\/(cutout\.[a-z0-9.-]+)\/preview$/);
  if (preview) return { id: preview[1], action: "cutout-preview", itemId: preview[2] };
  const subjectCrop = path.match(/^\/api\/projects\/([a-z0-9-]+)\/subject-tracks\/(subject\.[a-z0-9.-]+)\/crop$/);
  if (subjectCrop) return { id: subjectCrop[1], action: "subject-track-crop", itemId: subjectCrop[2] };
  const subjectAudio = path.match(/^\/api\/projects\/([a-z0-9-]+)\/subject-tracks\/(subject\.[a-z0-9.-]+)\/audio$/);
  if (subjectAudio) return { id: subjectAudio[1], action: "subject-track-audio", itemId: subjectAudio[2] };
  const cutoutJob = path.match(/^\/api\/projects\/([a-z0-9-]+)\/cutouts\/(cutout-job-[a-z0-9-]+)$/);
  if (cutoutJob) return { id: cutoutJob[1], action: "cutout-job", itemId: cutoutJob[2] };
  const cache = path.match(/^\/api\/projects\/([a-z0-9-]+)\/media\/(media\.[a-z0-9.]+)\/cache$/);
  if (cache) return { id: cache[1], action: "media-cache", itemId: cache[2] };
  const transcript = path.match(/^\/api\/projects\/([a-z0-9-]+)\/media\/(media\.[a-z0-9.]+)\/transcript$/);
  if (transcript) return { id: transcript[1], action: "media-transcript", itemId: transcript[2] };
  const media = path.match(/^\/api\/projects\/([a-z0-9-]+)\/media\/(media\.[a-z0-9.]+)$/);
  if (media) return { id: media[1], action: "media-source", itemId: media[2] };
  const subtitleCue = path.match(/^\/api\/projects\/([a-z0-9-]+)\/subtitles\/(subtitle\.[a-z0-9.-]+)$/);
  if (subtitleCue) return { id: subtitleCue[1], action: "subtitle-cue", itemId: subtitleCue[2] };
  const file = path.match(/^\/api\/projects\/([a-z0-9-]+)\/exports\/(export-[a-z0-9-]+)\/file$/);
  if (file) return { id: file[1], action: "export-file", itemId: file[2] };
  const job = path.match(/^\/api\/projects\/([a-z0-9-]+)\/exports\/(export-[a-z0-9-]+)$/);
  if (job) return { id: job[1], action: "export-job", itemId: job[2] };
  const asset = path.match(/^\/api\/projects\/([a-z0-9-]+)\/assets\/([a-z0-9-]+)$/);
  if (asset) return { id: asset[1], action: "asset", itemId: asset[2] };
  const route = path.match(/^\/api\/projects\/([a-z0-9-]+)(?:\/(media|pitch|exports|cutouts|subtitles))?$/);
  return route ? { id: route[1], action: (route[2] || "project") as ProjectAction, itemId: null } : null;
}

function parseRange(value: string | undefined, size: number): ByteRange | null {
  const match = value?.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return { start, end };
}

function mediaHeaders(path: string, size: number, range: ByteRange | null, downloadName?: string) {
  const length = range ? range.end - range.start + 1 : size;
  return { "accept-ranges": "bytes", "content-length": length, "content-type": mediaContentType(path), ...(downloadName ? { "content-disposition": attachmentHeader(downloadName) } : {}), ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${size}` } : {}) };
}

function mediaContentType(path: string) { return path.toLowerCase().endsWith(".mov") ? "video/quicktime" : path.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4"; }

function attachmentHeader(name: string) {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 5_000_000) throw new Error("Project update is too large.");
  }
  return body;
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function log(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "cutroom-projects", event, ...details }));
}

type ProjectAction = "catalog" | "references" | "raw-media" | "raw-media-attach" | "project" | "media" | "media-references" | "media-source" | "media-transcript" | "media-cache" | "cutouts" | "cutout-job" | "cutout-preview" | "subject-track-crop" | "subject-track-audio" | "asset" | "pitch" | "subtitles" | "subtitle-cue" | "exports" | "export-job" | "export-file";
type ProjectRoute = { id: string; action: ProjectAction; itemId: string | null };
type ByteRange = { start: number; end: number };

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, join } from "node:path";
import type { Plugin } from "vite";
import type { ExportPreset, SubtitleCue, VideoProject } from "../src/analysis-model";
import type { CreateCutoutInput } from "../src/CutoutModel";
import { projectsRoot } from "./media-analysis";
import { analyzeProjectPitch, readPitchArtifact } from "./pitch-analysis";
import { validateVideoProject } from "./project-schema";
import { ProjectRevisionConflict, projectDirectory, readStoredProject, writeStoredProject } from "./project-store";
import { addRemoteReference, attachCachedRemoteReference, mediaSourcePath, regenerateRemoteReference, removeRemoteReference } from "./ReferenceMediaCache";
import { runtimeRoot } from "./RuntimeStorage";
import { cancelExportJob, exportJobStatus, exportOverview, startExportJob } from "./VideoExportJobs";
import { listProjects, renameProject, trashProject } from "./ProjectCatalog";
import { cancelCutoutJob, durableCutoutJobStatus, startCutoutJob } from "./CutoutJobs";
import { attachRawMedia, detachRawMedia, ingestRawMedia, readRawMediaLibrary } from "./RawMediaLibrary";
import { editSubtitle, generateSubtitles, importSubtitles, previewGeneratedSubtitles, removeSubtitle, restoreSubtitle, type SubtitleEditInput } from "./SubtitleService";
import { attachLibraryReference, readReferenceMediaLibrary } from "./ReferenceMediaLibrary";
import type { CutoutCrop } from "../src/CutoutCropModel";
import { setSubjectTrackCrop } from "./SubjectTrackService";
import { setSubjectTrackAudio } from "./SubjectTrackAudio";
