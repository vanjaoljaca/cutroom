export async function renderProjectVideo(projectId: string, options: RenderOptions = {}): Promise<ExportReceipt> {
  const project = await readStoredProject(projectId);
  const cuts = programRanges(project);
  if (!cuts.length) throw new Error("The selected cut is empty.");
  const preset = options.preset || "original-format";
  if (preset === "original-format") return renderOriginalFormat(project, cuts, options);
  return renderTikTok(project, cuts, options);
}

async function renderTikTok(project: VideoProject, cuts: SourceRange[], options: RenderOptions): Promise<ExportReceipt> {
  const snapshotHash = projectSnapshotHash(project);
  const jobId = options.jobId || `export-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const paths = await prepareExportPaths(project, "tiktok-60", "mp4");
  const source = await probeMedia(project.sourcePath);
  const command = buildExportCommand(project, cuts, source, paths.partial);
  log("export_started", { projectId: project.id, jobId, preset: "tiktok-60", duration: cutDuration(cuts), output: paths.output });
  try {
    await runFfmpeg(command, cutDuration(cuts), options);
    const receipt = await finalizeTikTokExport(project, cuts, source, paths, jobId, snapshotHash);
    log("export_completed", { projectId: project.id, jobId, preset: "tiktok-60", output: receipt.outputPath, bytes: receipt.bytes });
    return receipt;
  } catch (error) {
    await unlink(paths.partial).catch(() => undefined);
    await writeFailureManifest(project.id, paths.manifest, jobId, snapshotHash, error);
    log("export_failed", { projectId: project.id, jobId, preset: "tiktok-60", error: message(error) });
    throw error;
  }
}

export function projectSnapshotHash(project: VideoProject): string {
  const bundles = project.assetLibrary.bundles.map(({ id, selectedAssetId }) => ({ id, selectedAssetId }));
  return createHash("sha256").update(JSON.stringify({ mediaLibrary: project.mediaLibrary, programTimeline: project.programTimeline, overlays: project.overlays, cutoutOverlays: project.cutoutOverlays, bundles })).digest("hex");
}

async function prepareExportPaths(project: VideoProject, preset: ExportPreset, extension: "mov" | "mp4"): Promise<ExportPaths> {
  const directory = join(projectDirectory(project.id), "exports");
  await mkdir(join(directory, ".partials"), { recursive: true });
  const exportVersion = project.exportHistory.length + 1;
  const preferred = exportFileStem({ projectTitle: project.title, preset, exportVersion, createdAt: new Date() });
  const stem = await availableExportStem(directory, preferred, extension);
  return { output: join(directory, `${stem}.${extension}`), partial: join(directory, ".partials", `${stem}.partial.${extension}`), manifest: join(directory, `${stem}.json`), exportVersion };
}

async function renderOriginalFormat(project: VideoProject, cuts: SourceRange[], options: RenderOptions): Promise<ExportReceipt> {
  if (cuts.some((cut) => cut.sourceId !== project.mediaLibrary.primarySourceId)) throw new Error("Original-format smart rendering cannot join multiple source videos safely. Use Export for TikTok for this stitch edit.");
  const source = await probeMedia(project.sourcePath);
  const keyframes = await probeKeyframes(project.sourcePath);
  const overlays = editorialOverlays(project, cuts).map((item) => ({ id: item.id, start: item.start, end: item.end }));
  const plan = planSourcePreservingExport({ projectId: project.id, source: sourcePlanMedia(project.sourcePath, source), cuts, overlays, keyframes });
  const snapshotHash = projectSnapshotHash(project);
  const jobId = options.jobId || `export-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const paths = await prepareExportPaths(project, "original-format", "mov");
  await atomicJson(paths.manifest, { status: plan.supported ? "planned" : "blocked", projectSnapshotHash: snapshotHash, createdAt: new Date().toISOString(), plan });
  log("source_export_planned", { projectId: project.id, jobId, strategy: plan.strategy, supported: plan.supported, manifest: paths.manifest });
  if (!plan.supported) throw new SourcePreservingExportBlockedError(plan.blocker!, paths.manifest);
  return renderSourceCopy(project, cuts, source, paths, jobId, snapshotHash, plan, options);
}

async function renderSourceCopy(project: VideoProject, cuts: SourceRange[], source: MediaProbe, paths: ExportPaths, jobId: string, snapshotHash: string, plan: SourcePreservingPlan, options: RenderOptions): Promise<ExportReceipt> {
  const listPath = `${paths.partial}.ffconcat`;
  await writeFile(listPath, concatList(project.sourcePath, cuts));
  try {
    await runFfmpeg(["-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", "-avoid_negative_ts", "make_zero", paths.partial], cutDuration(cuts), options);
    const output = await probeMedia(paths.partial);
    validateSourceCopy(output, source, cutDuration(cuts));
    return finishExport(project, cuts, source, output, paths, jobId, snapshotHash, "original-format", "stream-copy", null, plan);
  } finally {
    await unlink(listPath).catch(() => undefined);
  }
}

function concatList(path: string, cuts: SourceRange[]): string {
  const file = path.replaceAll("'", "'\\''");
  return `ffconcat version 1.0\n${cuts.map((cut) => `file '${file}'\ninpoint ${cut.start}\noutpoint ${cut.end}`).join("\n")}\n`;
}

function sourcePlanMedia(path: string, source: MediaProbe): SourcePlanMedia {
  if (source.videoCodec !== "hevc" || source.videoTag !== "hvc1" || source.audioCodec !== "aac") throw new Error("Original-format export currently requires an HEVC hvc1 MOV with AAC audio.");
  return { path, container: "mov", videoCodec: "hevc", videoTag: "hvc1", audioCodec: "aac", averageFps: source.averageFrameRate, width: source.width, height: source.height, rotation: source.rotation, color: "bt709" };
}

async function probeKeyframes(path: string): Promise<number[]> {
  const { stdout } = await execFile(ffprobePath, ["-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey", "-show_entries", "frame=best_effort_timestamp_time", "-of", "csv=p=0", path], { maxBuffer: 2_000_000, timeout: 60_000 });
  return stdout.split(/\s+/).map((value) => Number.parseFloat(value)).filter(Number.isFinite);
}

function buildExportCommand(project: VideoProject, cuts: SourceRange[], source: MediaProbe, output: string): string[] {
  const overlays = editorialOverlays(project, cuts);
  assertCutoutsReady(overlays);
  const args = ["-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats", "-y"];
  cuts.forEach((cut) => args.push("-i", programSourcePath(project, cut)));
  overlays.forEach((item) => addEditorialInput(args, project, item, source.averageFrameRate));
  const graph = filterGraph(project, cuts, overlays, source.width, source.height);
  return [...args, "-filter_complex", graph, "-map", "[exportv]", "-map", "[exporta]", ...videoEncodingArgs(), "-c:a", "aac", "-profile:a", "aac_low", "-ar", "48000", "-ac", "2", "-b:a", "256k", "-movflags", "+faststart", output];
}

export function videoEncodingArgs(): string[] {
  return ["-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high", "-level:v", "4.2", "-pix_fmt", "yuv420p", "-r", "60", "-fps_mode:v", "cfr", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", "-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709"];
}

function filterGraph(project: VideoProject, cuts: SourceRange[], overlays: EditorialOverlayInterval[], width: number, height: number): string {
  const trims = cuts.flatMap((cut, index) => clipFilters(project, cut, index, width, height));
  const inputs = cuts.map((_, index) => `[v${index}][a${index}]`).join("");
  const concat = `${inputs}concat=n=${cuts.length}:v=1:a=1[cutv][exporta]`;
  const overlayFilters = overlays.flatMap((interval, index) => editorialOverlayFilter(project, interval, index, cuts.length, width, height));
  const final = overlays.length ? `[composite${overlays.length - 1}]setsar=1[exportv]` : "[cutv]setsar=1[exportv]";
  return [...trims, concat, ...overlayFilters, final].join(";");
}

function clipFilters(project: VideoProject, cut: SourceRange, index: number, width: number, height: number): string[] {
  const duration = cut.end - cut.start;
  const video = `[${index}:v:0]trim=start=${cut.start}:end=${cut.end},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p[v${index}]`;
  const audio = sourceHasAudio(project, cut) ? `[${index}:a:0]atrim=start=${cut.start}:end=${cut.end},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${index}]` : `anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[a${index}]`;
  return [video, audio];
}

function imageOverlayFilter(project: VideoProject, interval: ImageOverlayCutInterval, index: number, inputIndex: number, width: number, height: number): string[] {
  const overlay = interval.overlay;
  const boxWidth = even(overlay.layout.width * width);
  const boxHeight = overlay.layout.height === null ? null : even(overlay.layout.height * height);
  const input = `[${inputIndex}:v:0]`;
  const scale = overlayScale(input, `overlay${index}`, boxWidth, boxHeight, overlay.layout.fit, overlay.opacity);
  const base = index === 0 ? "cutv" : `composite${index - 1}`;
  const x = Math.round(overlay.layout.x * width);
  const y = Math.round(overlay.layout.y * height);
  const composite = `[${base}][overlay${index}]overlay=x=${x}:y=${y}:enable='between(t,${interval.start},${interval.end})':eof_action=pass[composite${index}]`;
  return [scale, composite];
}

function cutoutOverlayFilter(interval: CutoutProgramInterval, index: number, inputIndex: number, width: number, height: number): string[] {
  const overlay = interval.overlay;
  const boxWidth = even(overlay.layout.width * width);
  const boxHeight = overlay.layout.height === null ? null : even(overlay.layout.height * height);
  const scaled = overlayScale(`[${inputIndex}:v:0]`, `cutout${index}`, boxWidth, boxHeight, overlay.layout.fit, overlay.opacity).replace("format=rgba,", `setpts=PTS-STARTPTS+${interval.start}/TB,format=rgba,`);
  const base = index === 0 ? "cutv" : `composite${index - 1}`;
  const x = Math.round(overlay.layout.x * width);
  const y = Math.round(overlay.layout.y * height);
  return [scaled, `[${base}][cutout${index}]overlay=x=${x}:y=${y}:enable='between(t,${interval.start},${interval.end})':eof_action=pass[composite${index}]`];
}

function editorialOverlayFilter(project: VideoProject, item: EditorialOverlayInterval, index: number, inputStart: number, width: number, height: number) {
  const inputIndex = inputStart + index;
  return item.kind === "image" ? imageOverlayFilter(project, item.interval, index, inputIndex, width, height) : cutoutOverlayFilter(item.interval, index, inputIndex, width, height);
}

function editorialOverlays(project: VideoProject, cuts: SourceRange[]): EditorialOverlayInterval[] {
  const images = imageOverlayCutIntervals(project, cuts).map((interval) => ({ kind: "image" as const, id: interval.overlay.id, layer: interval.overlay.layer, start: interval.start, end: interval.end, interval }));
  const cutouts = cutoutProgramIntervals(project, cuts).map((interval) => ({ kind: "cutout" as const, id: interval.overlay.id, layer: interval.overlay.layer, start: interval.start, end: interval.end, interval }));
  return [...images, ...cutouts].sort((left, right) => left.layer - right.layer || left.id.localeCompare(right.id));
}

function addEditorialInput(args: string[], project: VideoProject, item: EditorialOverlayInterval, fps: number) {
  if (item.kind === "image") return void args.push("-loop", "1", "-framerate", fps.toFixed(6), "-i", assetPath(project, item.interval.overlay.assetId));
  args.push("-i", cutoutRenderPath(project, item.interval));
}

function assertCutoutsReady(items: EditorialOverlayInterval[]) {
  const unavailable = items.find((item) => item.kind === "cutout" && item.interval.overlay.processing.status !== "ready");
  if (unavailable?.kind === "cutout") throw new Error(`Subject cutout is ${unavailable.interval.overlay.processing.status}; wait for it to finish or remove it before export.`);
}

function cutoutRenderPath(project: VideoProject, interval: CutoutProgramInterval) {
  const path = interval.overlay.processing.renderPath;
  if (!path) throw new Error(`Subject cutout render is unavailable: ${interval.overlay.id}`);
  return join(projectDirectory(project.id), path);
}

function overlayScale(input: string, output: string, width: number, height: number | null, fit: "contain" | "cover", opacity: number): string {
  if (height === null) return `${input}format=rgba,scale=${width}:-2:flags=lanczos,colorchannelmixer=aa=${opacity}[${output}]`;
  if (fit === "cover") return `${input}format=rgba,scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},colorchannelmixer=aa=${opacity}[${output}]`;
  return `${input}format=rgba,scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0,colorchannelmixer=aa=${opacity}[${output}]`;
}

async function runFfmpeg(args: string[], duration: number, options: RenderOptions): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
    child.stdout.on("data", (chunk) => parseProgress(String(chunk), duration, options.onProgress));
    const abort = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", abort, { once: true });
    child.on("error", reject);
    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted) return reject(new Error("Export cancelled."));
      code === 0 ? resolve() : reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}.`));
    });
  });
}

function parseProgress(chunk: string, duration: number, onProgress?: (progress: number) => void) {
  const matches = [...chunk.matchAll(/out_time_us=(\d+)/g)];
  const microseconds = Number(matches.at(-1)?.[1] || 0);
  if (microseconds > 0) onProgress?.(Math.min(0.99, microseconds / 1_000_000 / duration));
}

async function finalizeTikTokExport(project: VideoProject, cuts: SourceRange[], source: MediaProbe, paths: ExportPaths, jobId: string, snapshotHash: string): Promise<ExportReceipt> {
  const probe = await probeMedia(paths.partial);
  validateTikTokMedia(probe, source, cutDuration(cuts), (await stat(paths.partial)).size);
  return finishExport(project, cuts, source, probe, paths, jobId, snapshotHash, "tiktok-60", "full-transcode", qualityProfile, null);
}

async function finishExport(project: VideoProject, cuts: SourceRange[], source: MediaProbe, output: MediaProbe, paths: ExportPaths, jobId: string, snapshotHash: string, preset: ExportPreset, strategy: ExportStrategy, profile: ExportQualityProfile | null, plan: SourcePreservingPlan | null): Promise<ExportReceipt> {
  await rename(paths.partial, paths.output);
  const bytes = (await stat(paths.output)).size;
  const receipt = makeReceipt(project, cuts, paths, jobId, snapshotHash, source, output, bytes, preset, strategy, profile);
  await atomicJson(paths.manifest, { status: "completed", projectId: project.id, receipt, ffprobe: output, plan });
  const latest = await readStoredProject(project.id);
  await writeStoredProject({ ...latest, exportHistory: [...latest.exportHistory, receipt] });
  return receipt;
}

function validateTikTokMedia(probe: MediaProbe, source: MediaProbe, expectedDuration: number, bytes: number) {
  if (probe.videoCodec !== "h264" || probe.audioCodec !== "aac") throw new Error("Export validation failed: expected H.264 video and AAC audio.");
  if (probe.width !== source.width || probe.height !== source.height) throw new Error("Export validation failed: source dimensions changed.");
  validateCadence(source.averageFrameRate, probe.averageFrameRate);
  if (Math.abs(probe.averageFrameRate - 60) > 0.001) throw new Error(`TikTok validation failed: expected constant 60 fps, got ${probe.averageFrameRate.toFixed(3)}.`);
  if (probe.pixelFormat !== "yuv420p" || probe.colorSpace !== "bt709") throw new Error("Export validation failed: expected yuv420p BT.709 video.");
  if (Math.abs(probe.duration - expectedDuration) > 0.35) throw new Error(`Export validation failed: expected ${expectedDuration.toFixed(2)}s, got ${probe.duration.toFixed(2)}s.`);
  const restrictions = validateTikTokRestrictions({ container: probe.container, videoCodec: probe.videoCodec, videoProfile: probe.videoProfile, averageFps: probe.averageFrameRate, width: probe.width, height: probe.height, pixelFormat: probe.pixelFormat, colorSpace: probe.colorSpace, audioCodec: probe.audioCodec, audioSampleRate: probe.audioSampleRate, audioChannels: probe.audioChannels, bytes });
  if (!restrictions.valid) throw new Error(`TikTok validation failed: ${restrictions.failures.join("; ")}`);
}

function validateSourceCopy(probe: MediaProbe, source: MediaProbe, expectedDuration: number) {
  if (probe.videoCodec !== "hevc" || probe.videoTag !== source.videoTag || probe.audioCodec !== "aac") throw new Error("Source-copy validation failed: HEVC hvc1/AAC was not preserved.");
  if (probe.width !== source.width || probe.height !== source.height || probe.rotation !== source.rotation) throw new Error("Source-copy validation failed: geometry or rotation changed.");
  validateCadence(source.averageFrameRate, probe.averageFrameRate);
  if (Math.abs(probe.duration - expectedDuration) > 0.08) throw new Error("Source-copy validation failed: cut duration changed.");
}

function makeReceipt(project: VideoProject, cuts: SourceRange[], paths: ExportPaths, jobId: string, snapshotHash: string, source: MediaProbe, output: MediaProbe, bytes: number, preset: ExportPreset, strategy: ExportStrategy, profile: ExportQualityProfile | null): ExportReceipt {
  const root = projectDirectory(project.id);
  return { version: 3, jobId, projectSnapshotHash: snapshotHash, exportVersion: paths.exportVersion, selectedCutDuration: cutDuration(cuts), outputPath: relative(root, paths.output), manifestPath: relative(root, paths.manifest), codec: { video: output.videoCodec as "hevc" | "h264", audio: "aac" }, width: source.width, height: source.height, bytes, createdAt: new Date().toISOString(), sourceCadence: cadence(source), outputCadence: cadence(output), qualityProfile: profile, preset, strategy, container: preset === "original-format" ? "mov" : "mp4" };
}

async function probeMedia(path: string): Promise<MediaProbe> {
  const { stdout } = await execFile(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { maxBuffer: 2_000_000, timeout: 60_000 });
  const data = JSON.parse(stdout) as ProbeJson;
  const video = data.streams.find((stream) => stream.codec_type === "video");
  const audio = data.streams.find((stream) => stream.codec_type === "audio");
  if (!video || !audio) throw new Error("Media validation failed: video and audio streams are required.");
  const rotation = Number(video.side_data_list?.find((item) => item.side_data_type === "Display Matrix")?.rotation || 0);
  const rotated = Math.abs(rotation) % 180 === 90;
  return { width: Number(rotated ? video.height : video.width), height: Number(rotated ? video.width : video.height), videoCodec: video.codec_name, videoTag: video.codec_tag_string || "unknown", videoProfile: video.profile || "unknown", videoLevel: Number(video.level || 0), audioCodec: audio.codec_name, audioSampleRate: Number(audio.sample_rate || 0), audioChannels: Number(audio.channels || 0), duration: Number(data.format.duration), container: data.format.format_name || "unknown", rotation, averageFrameRate: rate(video.avg_frame_rate), reportedFrameRate: rate(video.r_frame_rate), frameCount: Number(video.nb_frames || 0), bitRate: Number(video.bit_rate || 0), pixelFormat: video.pix_fmt || "unknown", colorSpace: video.color_space || "unknown", colorTransfer: video.color_transfer || "unknown", colorPrimaries: video.color_primaries || "unknown", colorRange: video.color_range || "unknown", sampleAspectRatio: video.sample_aspect_ratio || "unknown" };
}

export function validateCadence(sourceFps: number, outputFps: number) {
  if (!sourceFps || !outputFps || Math.abs(outputFps - sourceFps) / sourceFps > 0.005) throw new Error(`Export validation failed: source cadence ${sourceFps.toFixed(3)} fps became ${outputFps.toFixed(3)} fps.`);
}

function cadence(probe: MediaProbe): ExportCadence { return { averageFps: probe.averageFrameRate, reportedFps: probe.reportedFrameRate, frameCount: probe.frameCount }; }
function rate(value = "0/1"): number { const [top, bottom] = value.split("/").map(Number); return bottom ? top / bottom : top || 0; }

async function writeFailureManifest(projectId: string, path: string, jobId: string, snapshotHash: string, error: unknown) {
  await atomicJson(path, { status: message(error) === "Export cancelled." ? "cancelled" : "failed", projectId, jobId, projectSnapshotHash: snapshotHash, error: message(error), createdAt: new Date().toISOString() });
}

async function atomicJson(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function availableExportStem(directory: string, preferred: string, extension: "mov" | "mp4") {
  let candidate = preferred;
  let collision = 1;
  while (await pathExists(join(directory, `${candidate}.${extension}`)) || await pathExists(join(directory, `${candidate}.json`))) candidate = `${preferred} (${++collision})`;
  return candidate;
}

async function pathExists(path: string) {
  try { await access(path); return true; } catch { return false; }
}

function assetPath(project: VideoProject, assetId: string): string {
  const asset = project.assetLibrary.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error(`Unknown export overlay asset: ${assetId}`);
  return join(projectDirectory(project.id), asset.relativePath);
}

function programSourcePath(project: VideoProject, cut: SourceRange): string {
  const source = project.mediaLibrary.sources.find((candidate) => candidate.id === cut.sourceId);
  if (!source) throw new Error(`Unknown program source: ${cut.sourceId}`);
  return mediaSourcePath(source);
}

function sourceHasAudio(project: VideoProject, cut: SourceRange): boolean {
  const source = project.mediaLibrary.sources.find((candidate) => candidate.id === cut.sourceId);
  return source?.metadata?.audioCodec !== null;
}

function even(value: number): number { return Math.max(2, Math.round(value / 2) * 2); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-export", event, ...details })); }

export type RenderOptions = { jobId?: string; preset?: ExportPreset; signal?: AbortSignal; onProgress?: (progress: number) => void };
type ExportPaths = { output: string; partial: string; manifest: string; exportVersion: number };
type MediaProbe = { width: number; height: number; videoCodec: string; videoTag: string; videoProfile: string; videoLevel: number; audioCodec: string; audioSampleRate: number; audioChannels: number; duration: number; container: string; rotation: number; averageFrameRate: number; reportedFrameRate: number; frameCount: number; bitRate: number; pixelFormat: string; colorSpace: string; colorTransfer: string; colorPrimaries: string; colorRange: string; sampleAspectRatio: string };
type ProbeJson = { streams: Array<{ codec_type: string; codec_name: string; codec_tag_string?: string; profile?: string; level?: number; sample_rate?: string; channels?: number; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; nb_frames?: string; bit_rate?: string; pix_fmt?: string; color_space?: string; color_transfer?: string; color_primaries?: string; color_range?: string; sample_aspect_ratio?: string; side_data_list?: Array<{ side_data_type: string; rotation?: number }> }>; format: { duration: string; format_name?: string } };
type EditorialOverlayInterval = { kind: "image"; id: string; layer: number; start: number; end: number; interval: ImageOverlayCutInterval } | { kind: "cutout"; id: string; layer: number; start: number; end: number; interval: CutoutProgramInterval };

import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, rename, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import type { ExportCadence, ExportPreset, ExportQualityProfile, ExportReceipt, ExportStrategy, VideoProject } from "../src/analysis-model";
import type { SourceRange } from "../src/editor-model";
import { cutDuration } from "../src/editor-model";
import { imageOverlayCutIntervals, type ImageOverlayCutInterval } from "../src/overlay-model";
import { programRanges } from "../src/ProgramTimelineModel";
import { projectDirectory, readStoredProject, writeStoredProject } from "./project-store";
import { planSourcePreservingExport, type SourcePlanMedia, type SourcePreservingPlan } from "./SourcePreservingExportPlanner";
import { validateTikTokRestrictions } from "./TikTokExportValidator";
import { exportFileStem } from "./ExportNaming";
import { mediaSourcePath } from "./ReferenceMediaCache";
import { cutoutProgramIntervals, type CutoutProgramInterval } from "../src/CutoutOverlayModel";

const execFile = promisify(execFileCallback);
const ffmpegPath = process.env.CUTROOM_FFMPEG || "ffmpeg";
const ffprobePath = process.env.CUTROOM_FFPROBE || "ffprobe";
const qualityProfile: ExportQualityProfile = { encoder: "libx264", preset: "slow", crf: 14, profile: "high", level: "4.2", pixelFormat: "yuv420p", color: "bt709", fpsMode: "cfr-60", audio: "aac-lc-48k-256k" };

export class SourcePreservingExportBlockedError extends Error {
  constructor(reason: string, manifestPath: string) { super(`${reason} Plan: ${manifestPath}`); }
}
