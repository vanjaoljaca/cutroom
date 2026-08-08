export function normalizeVideoProject(project: VideoProject): VideoProject {
  const library = project.assetLibrary || { version: 1, assets: [], bundles: [] };
  const assets = (library.assets || []).map((asset) => ({ ...asset, source: asset.source || emptySource }));
  const bundles = library.bundles || [];
  const overlays = (project.overlays || []).map((overlay) => ({ ...overlay, bundleId: overlay.bundleId || null }));
  const cutoutOverlays = project.cutoutOverlays || [];
  const exportHistory = (project.exportHistory || []).map((receipt, index) => normalizeExportReceipt(receipt, index + 1));
  const mediaLibrary = project.mediaLibrary || legacyMediaLibrary(project);
  const programTimeline = project.programTimeline || createProgramTimeline(project.scenes, mediaLibrary.primarySourceId, project.createdAt || "");
  const editorPreferences = project.editorPreferences || { timelineWindow: "auto" };
  return { ...project, schemaVersion: 1, revision: project.revision || 0, mediaLibrary, programTimeline, editorPreferences, assetLibrary: { version: 1, assets, bundles }, overlays, cutoutOverlays, pitchAnalysis: currentPitchReference(project.pitchAnalysis), exportHistory };
}

export function validateVideoProject(input: VideoProject): VideoProject {
  const project = normalizeVideoProject(input);
  assert(project.schemaVersion === 1, "Unsupported project schema version.");
  assert(Number.isInteger(project.revision) && project.revision >= 0, "Invalid project revision.");
  validateMediaLibrary(project.mediaLibrary);
  validateProgramTimeline(project);
  assert(["auto", "15", "60", "180", "300"].includes(project.editorPreferences.timelineWindow), "Invalid timeline window.");
  validateAssets(project);
  validateBundles(project);
  project.overlays.forEach((overlay) => validateOverlay(project, overlay));
  project.cutoutOverlays.forEach((overlay) => validateCutoutOverlay(project, overlay));
  if (project.pitchAnalysis) validatePitchReference(project.pitchAnalysis);
  project.exportHistory.forEach(validateExportReceipt);
  return project;
}

function validateMediaLibrary(library: MediaLibrary) {
  assert(library.version === 1 && library.sources.length > 0, "Invalid media library.");
  const ids = new Set<string>();
  library.sources.forEach((source) => validateMediaSource(source, ids));
  assert(ids.has(library.primarySourceId), "Unknown primary media source.");
}

function validateMediaSource(source: VideoMediaSource, ids: Set<string>) {
  assert(!ids.has(source.id) && /^media\.[a-z0-9.]+$/.test(source.id), `Invalid media source id: ${source.id}`);
  assert(source.kind === "video" && source.label.trim().length > 0, `Invalid media source: ${source.id}`);
  assert(["instruction", "creator", "reference"].includes(source.role), `Invalid media role: ${source.id}`);
  validateMediaOrigin(source);
  if (source.cache) validateMediaCache(source.cache, source.id);
  if (source.metadata) validateMediaMetadata(source.metadata, source.id);
  ids.add(source.id);
}

function validateMediaOrigin(source: VideoMediaSource) {
  if (source.origin.type === "local") assert(source.origin.path.startsWith("/"), `Invalid local media path: ${source.id}`);
  if (source.origin.type === "remote") assert(/^https?:\/\//.test(source.origin.url), `Invalid remote media URL: ${source.id}`);
  assert(source.origin.type === "local" || source.origin.type === "remote", `Invalid media origin: ${source.id}`);
}

function validateMediaCache(cache: RemoteMediaCache, sourceId: string) {
  assert(/^cache\/media\/[a-f0-9]{64}\.(mov|mp4|m4v)$/.test(cache.relativePath), `Unsafe media cache path: ${sourceId}`);
  assert(/^[a-f0-9]{64}$/.test(cache.sha256) && cache.bytes > 0, `Invalid media cache: ${sourceId}`);
}

function validateMediaMetadata(metadata: VideoMediaMetadata, sourceId: string) {
  assert(metadata.duration > 0 && metadata.width > 0 && metadata.height > 0, `Invalid media geometry: ${sourceId}`);
  assert(metadata.averageFps > 0 && metadata.videoCodec.length > 0 && metadata.container.length > 0, `Invalid media metadata: ${sourceId}`);
}

function validateProgramTimeline(project: VideoProject) {
  assert(project.programTimeline.version === 1, "Invalid program timeline.");
  const ids = new Set<string>();
  project.programTimeline.clips.forEach((clip) => {
    assert(!ids.has(clip.id) && /^clip\.[a-z0-9.-]+$/.test(clip.id), `Invalid program clip id: ${clip.id}`);
    assert(project.mediaLibrary.sources.some((source) => source.id === clip.sourceId), `Unknown program clip source: ${clip.id}`);
    assert(clip.label.trim().length > 0 && clip.sourceStart >= 0 && clip.sourceEnd - clip.sourceStart >= 0.08, `Invalid program clip interval: ${clip.id}`);
    if (clip.kind === "scene") validateSceneClip(project, clip);
    else assert(clip.kind === "source" && clip.sceneId === null && clip.takeId === null, `Invalid source clip: ${clip.id}`);
    ids.add(clip.id);
  });
}

function validateSceneClip(project: VideoProject, clip: ProgramClip) {
  const scene = project.scenes.find((candidate) => candidate.id === clip.sceneId);
  const take = scene?.takes.find((candidate) => candidate.id === clip.takeId);
  assert(Boolean(scene && take), `Unknown scene clip target: ${clip.id}`);
}

function validateCutoutOverlay(project: VideoProject, overlay: SubjectCutoutOverlay) {
  assert(/^cutout\.[a-z0-9.-]+$/.test(overlay.id) && overlay.kind === "subject-cutout", `Invalid cutout id: ${overlay.id}`);
  assert(project.mediaLibrary.sources.some((source) => source.id === overlay.sourceId), `Unknown cutout source: ${overlay.id}`);
  const target = project.programTimeline.clips.find((clip) => clip.id === overlay.target.clipId);
  assert(Boolean(target) && overlay.target.type === "program-clip", `Unknown cutout target: ${overlay.id}`);
  assert(overlay.sourceStart >= 0 && overlay.sourceEnd > overlay.sourceStart, `Invalid cutout source interval: ${overlay.id}`);
  assert(overlay.target.start >= 0 && overlay.target.end > overlay.target.start && overlay.target.end <= target!.sourceEnd - target!.sourceStart + 0.001, `Invalid cutout target interval: ${overlay.id}`);
  assert(overlay.target.end - overlay.target.start <= overlay.sourceEnd - overlay.sourceStart + 0.001, `Cutout target exceeds source duration: ${overlay.id}`);
  assert(overlay.layout.x >= 0 && overlay.layout.x <= 1 && overlay.layout.y >= 0 && overlay.layout.y <= 1 && overlay.layout.width > 0 && overlay.layout.width <= 1, `Invalid cutout layout: ${overlay.id}`);
  assert(overlay.opacity >= 0 && overlay.opacity <= 1 && Number.isInteger(overlay.layer), `Invalid cutout layer: ${overlay.id}`);
  validateCutoutProcessing(overlay);
}

function validateCutoutProcessing(overlay: SubjectCutoutOverlay) {
  const processing = overlay.processing;
  const root = `derived/cutouts/${overlay.id}/`;
  assert(processing.provider === "rembg-u2net-human" && processing.providerVersion === "1.0.0", `Unsupported cutout provider: ${overlay.id}`);
  assert(["queued", "processing", "ready", "failed"].includes(processing.status), `Invalid cutout status: ${overlay.id}`);
  assert(processing.recipePath === `${root}recipe.json`, `Unsafe cutout recipe path: ${overlay.id}`);
  assert(processing.previewPath === null || processing.previewPath === `${root}preview.webm`, `Unsafe cutout preview path: ${overlay.id}`);
  assert(processing.renderPath === null || processing.renderPath === `${root}render.mov`, `Unsafe cutout render path: ${overlay.id}`);
  if (processing.status === "ready") assert(Boolean(processing.previewPath && processing.renderPath), `Incomplete cutout artifacts: ${overlay.id}`);
}

function validatePitchReference(pitch: PitchAnalysisReference) {
  assert(pitch.version === 2 && pitch.artifactPath === "analysis/pitch-v2.json", "Invalid pitch artifact reference.");
  assert(pitch.algorithm === "normalized-autocorrelation" && pitch.algorithmVersion === "1.1.0", "Unsupported pitch algorithm.");
  assert(pitch.sampleRate > 0 && pitch.windowSize > pitch.hopSize && pitch.hopSize > 0, "Invalid pitch sampling metadata.");
  assert(pitch.confidenceThreshold >= 0 && pitch.confidenceThreshold <= 1, "Invalid pitch confidence threshold.");
  assert(pitch.pointCount >= pitch.voicedPointCount && pitch.voicedPointCount >= 0, "Invalid pitch point counts.");
}

function validateExportReceipt(receipt: ExportReceipt) {
  assert((receipt.version === 1 || receipt.version === 2 || receipt.version === 3) && /^export-[a-z0-9-]+$/.test(receipt.jobId), "Invalid export receipt id.");
  assert(/^[a-f0-9]{64}$/.test(receipt.projectSnapshotHash), "Invalid export snapshot hash.");
  assert(safeExportPath(receipt.outputPath, ["mp4", "mov"]) && safeExportPath(receipt.manifestPath, ["json"]), "Unsafe export path.");
  assert(receipt.selectedCutDuration > 0 && receipt.width > 0 && receipt.height > 0 && receipt.bytes > 0, "Invalid export metadata.");
  assert(Number.isInteger(receipt.exportVersion) && receipt.exportVersion > 0, "Invalid export version.");
  assert((receipt.codec.video === "h264" || receipt.codec.video === "hevc") && receipt.codec.audio === "aac", "Unsupported export codecs.");
  if (receipt.version === 2) validateExportQuality(receipt);
  if (receipt.version === 3) validateExportPreset(receipt);
}

function normalizeExportReceipt(receipt: ExportReceipt, exportVersion: number): ExportReceipt {
  return { ...receipt, exportVersion: receipt.exportVersion || exportVersion, sourceCadence: normalizeCadence(receipt.sourceCadence, 0), outputCadence: normalizeCadence(receipt.outputCadence, receipt.selectedCutDuration), qualityProfile: receipt.qualityProfile || null, preset: receipt.preset || null, strategy: receipt.strategy || null, container: receipt.container || null };
}

function safeExportPath(path: string, extensions: string[]) {
  if (!path.startsWith("exports/") || path.includes("..") || path.slice(8).includes("/")) return false;
  return extensions.some((extension) => path.toLowerCase().endsWith(`.${extension}`));
}

function normalizeCadence(cadence: ExportCadence | null | undefined, duration: number): ExportCadence | null {
  if (!cadence) return null;
  const legacy = cadence as unknown as { averageFps: number; reportedFps?: number; nominalFps?: number; frameCount?: number };
  return { averageFps: legacy.averageFps, reportedFps: legacy.reportedFps || legacy.nominalFps || legacy.averageFps, frameCount: legacy.frameCount || Math.round(legacy.averageFps * duration) };
}

function validateExportQuality(receipt: ExportReceipt) {
  assert(Boolean(receipt.sourceCadence && receipt.outputCadence && receipt.qualityProfile), "Missing export quality metadata.");
  assert(receipt.sourceCadence!.averageFps > 0 && receipt.outputCadence!.averageFps > 0 && receipt.outputCadence!.frameCount > 0, "Invalid export cadence.");
  assert(receipt.qualityProfile!.crf === 14 && receipt.qualityProfile!.preset === "slow", "Unsupported export quality profile.");
}

function validateExportPreset(receipt: ExportReceipt) {
  assert(Boolean(receipt.preset && receipt.strategy && receipt.container), "Missing export preset metadata.");
  assert(receipt.preset !== "original-format" || (receipt.codec.video === "hevc" && receipt.container === "mov" && receipt.strategy === "stream-copy"), "Original-format export must preserve HEVC/MOV by stream copy.");
  assert(receipt.preset !== "tiktok-60" || Boolean(receipt.codec.video === "h264" && receipt.container === "mp4" && receipt.strategy === "full-transcode" && receipt.qualityProfile), "Invalid TikTok export receipt.");
}

function validateBundles(project: VideoProject) {
  const ids = new Set<string>();
  project.assetLibrary.bundles.forEach((bundle) => {
    assert(!ids.has(bundle.id), `Duplicate bundle id: ${bundle.id}`);
    assert(bundle.kind === "image-candidates" && bundle.label.length > 0, `Invalid bundle: ${bundle.id}`);
    assert(/^bundle-[a-z0-9-]+$/.test(bundle.id), `Invalid bundle id: ${bundle.id}`);
    validateSource(bundle.source, `bundle ${bundle.id}`);
    assert(bundle.candidateAssetIds.length <= 5 && new Set(bundle.candidateAssetIds).size === bundle.candidateAssetIds.length, `Invalid bundle candidates: ${bundle.id}`);
    bundle.candidateAssetIds.forEach((id) => assert(project.assetLibrary.assets.some((asset) => asset.id === id), `Unknown bundle asset: ${id}`));
    assert(bundle.selectedAssetId === null || bundle.candidateAssetIds.includes(bundle.selectedAssetId), `Selected asset is not in bundle: ${bundle.id}`);
    ids.add(bundle.id);
  });
}

function validateAssets(project: VideoProject) {
  const ids = new Set<string>();
  project.assetLibrary.assets.forEach((asset) => {
    assert(!ids.has(asset.id), `Duplicate asset id: ${asset.id}`);
    assert(asset.kind === "image", `Unsupported asset kind: ${asset.kind}`);
    assert(/^assets\/[a-z0-9-]+\.(png|jpe?g|webp)$/.test(asset.relativePath), `Unsafe asset path: ${asset.relativePath}`);
    assert(asset.width > 0 && asset.height > 0 && asset.bytes > 0, `Invalid image metadata: ${asset.id}`);
    validateSource(asset.source, `asset ${asset.id}`);
    ids.add(asset.id);
  });
}

function validateSource(source: AssetSource, owner: string) {
  assert(source.sourceUrl === null || /^https?:\/\//.test(source.sourceUrl), `Invalid source URL for ${owner}`);
  assert(source.attribution === null || source.attribution.trim().length > 0, `Invalid attribution for ${owner}`);
  assert(source.license === null || source.license.trim().length > 0, `Invalid license for ${owner}`);
}

function validateOverlay(project: VideoProject, overlay: ImageOverlay) {
  assert(project.assetLibrary.assets.some((asset) => asset.id === overlay.assetId), `Unknown overlay asset: ${overlay.assetId}`);
  if (overlay.bundleId) validateOverlayBundle(project, overlay);
  assert(overlay.target.start >= 0 && overlay.target.end > overlay.target.start, `Invalid overlay interval: ${overlay.id}`);
  assert(overlay.layout.x >= 0 && overlay.layout.x <= 1 && overlay.layout.y >= 0 && overlay.layout.y <= 1, `Invalid overlay position: ${overlay.id}`);
  assert(overlay.layout.width > 0 && overlay.layout.width <= 1, `Invalid overlay width: ${overlay.id}`);
  assert(overlay.layout.height === null || (overlay.layout.height > 0 && overlay.layout.height <= 1), `Invalid overlay height: ${overlay.id}`);
  assert(Number.isInteger(overlay.layer) && overlay.opacity >= 0 && overlay.opacity <= 1, `Invalid overlay layer/opacity: ${overlay.id}`);
  if (overlay.target.type === "take") validateTakeTarget(project, overlay);
}

function validateOverlayBundle(project: VideoProject, overlay: ImageOverlay) {
  const bundle = project.assetLibrary.bundles.find((item) => item.id === overlay.bundleId);
  assert(Boolean(bundle), `Unknown overlay bundle: ${overlay.bundleId}`);
  assert(bundle!.candidateAssetIds.includes(overlay.assetId), `Overlay asset is not in bundle: ${overlay.id}`);
  assert(bundle!.selectedAssetId === overlay.assetId, `Overlay asset does not match bundle selection: ${overlay.id}`);
}

function validateTakeTarget(project: VideoProject, overlay: ImageOverlay) {
  const target = overlay.target;
  if (target.type !== "take") return;
  const scene = project.scenes.find((item) => item.id === target.sceneId);
  const take = scene?.takes.find((item) => item.id === target.takeId);
  assert(Boolean(take), `Unknown overlay take target: ${target.sceneId}/${target.takeId}`);
  assert(target.end <= (take!.end - take!.start) + 0.001, `Overlay exceeds take duration: ${overlay.id}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function currentPitchReference(reference: PitchAnalysisReference | null | undefined): PitchAnalysisReference | null {
  if (reference?.version !== 2 || reference.artifactPath !== "analysis/pitch-v2.json") return null;
  return reference;
}

function legacyMediaLibrary(project: VideoProject): MediaLibrary {
  const primary: VideoMediaSource = { id: "media.primary", kind: "video", role: "instruction", label: project.sourceName || project.title || "Primary source", origin: { type: "local", path: project.sourcePath }, cache: null, metadata: null, createdAt: project.createdAt || "" };
  return { version: 1, primarySourceId: primary.id, sources: [primary] };
}

const emptySource = { sourceUrl: null, attribution: null, license: null };

import type { AssetSource, ExportCadence, ExportReceipt, ImageOverlay, MediaLibrary, PitchAnalysisReference, ProgramClip, RemoteMediaCache, SubjectCutoutOverlay, VideoMediaMetadata, VideoMediaSource, VideoProject } from "../src/analysis-model";
import { createProgramTimeline } from "../src/ProgramTimelineModel";
