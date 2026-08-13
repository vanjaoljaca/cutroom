export function normalizeVideoProject(project: VideoProject): VideoProject {
  const library = project.assetLibrary || { version: 1, assets: [], bundles: [] };
  const assets = (library.assets || []).map((asset) => ({ ...asset, source: asset.source || emptySource }));
  const bundles = library.bundles || [];
  const overlays = (project.overlays || []).map((overlay) => ({ ...overlay, bundleId: overlay.bundleId || null }));
  const cutoutOverlays = project.cutoutOverlays || [];
  const videoOverlays = project.videoOverlays || [];
  const subtitleState = normalizeSubtitleTrack(project);
  const textOverlays = subtitleState.textOverlays;
  const exportHistory = (project.exportHistory || []).map((receipt, index) => normalizeExportReceipt(receipt, index + 1));
  const mediaLibrary = normalizeMediaLibrary(project.mediaLibrary || legacyMediaLibrary(project));
  const timeline = project.programTimeline || createProgramTimeline(project.scenes, mediaLibrary.primarySourceId, project.createdAt || "");
  const programTimeline = { ...timeline, deletedClips: timeline.deletedClips || [] };
  const recordingPlan = recordingPlanForProject({ ...project, mediaLibrary, programTimeline } as VideoProject);
  const editorPreferences = project.editorPreferences || { timelineWindow: "auto" };
  return { ...project, schemaVersion: 1, revision: project.revision || 0, recordingPlan, mediaLibrary, programTimeline, editorPreferences, assetLibrary: { version: 1, assets, bundles }, overlays, cutoutOverlays, videoOverlays, textOverlays, subtitleTrack: subtitleState.subtitleTrack, pitchAnalysis: currentPitchReference(project.pitchAnalysis), exportHistory };
}

export function validateVideoProject(input: VideoProject): VideoProject {
  const project = normalizeVideoProject(input);
  assert(project.schemaVersion === 1, "Unsupported project schema version.");
  assert(Number.isInteger(project.revision) && project.revision >= 0, "Invalid project revision.");
  validateMediaLibrary(project.mediaLibrary);
  validateRecordingPlan(project);
  validateProgramTimeline(project);
  assert(["auto", "15", "60", "180", "300"].includes(project.editorPreferences.timelineWindow), "Invalid timeline window.");
  validateAssets(project);
  validateBundles(project);
  project.overlays.forEach((overlay) => validateOverlay(project, overlay));
  project.cutoutOverlays.forEach((overlay) => validateCutoutOverlay(project, overlay));
  project.videoOverlays.forEach((overlay) => validateVideoOverlay(project, overlay));
  project.textOverlays.forEach((overlay) => validateTextOverlay(project, overlay));
  validateSubtitleTrack(project);
  if (project.pitchAnalysis) validatePitchReference(project.pitchAnalysis);
  project.exportHistory.forEach(validateExportReceipt);
  return project;
}

function validateTextOverlay(project: VideoProject, overlay: TextOverlay) {
  assert(/^text\.[a-z0-9.-]+$/.test(overlay.id) && overlay.kind === "text" && ["title", "caption"].includes(overlay.role), `Invalid text overlay: ${overlay.id}`);
  assert(overlay.text.trim().length > 0 && overlay.text.length <= 500, `Invalid text content: ${overlay.id}`);
  if (overlay.target.type === "selected-cut") assert(overlay.target.start >= 0 && overlay.target.end > overlay.target.start, `Invalid text interval: ${overlay.id}`);
  else validateTextClipTarget(project, overlay);
  assert(overlay.layout.x >= 0 && overlay.layout.x <= 1 && overlay.layout.y >= 0 && overlay.layout.y <= 1 && overlay.layout.maxWidth > 0 && overlay.layout.maxWidth <= 1, `Invalid text layout: ${overlay.id}`);
  assert(["system-sans", "classic-social", "tiktok-sans"].includes(overlay.style.fontFamily) && [400, 600, 700].includes(overlay.style.fontWeight) && overlay.style.fontSize >= 12 && overlay.style.fontSize <= 240, `Invalid text style: ${overlay.id}`);
  assert(/^#[a-fA-F0-9]{6}$/.test(overlay.style.color) && overlay.opacity >= 0 && overlay.opacity <= 1 && Number.isInteger(overlay.layer), `Invalid text color/layer: ${overlay.id}`);
  assert(overlay.style.backgroundColor === null || /^#[a-fA-F0-9]{6}$/.test(overlay.style.backgroundColor), `Invalid text background: ${overlay.id}`);
  assert(overlay.style.strokeColor === null || /^#[a-fA-F0-9]{6}$/.test(overlay.style.strokeColor), `Invalid text stroke: ${overlay.id}`);
  assert(overlay.style.strokeWidth >= 0 && overlay.style.strokeWidth <= 12 && ["left", "center", "right"].includes(overlay.style.align), `Invalid text decoration: ${overlay.id}`);
}

function validateTextClipTarget(project: VideoProject, overlay: TextOverlay) {
  const target = overlay.target;
  if (target.type !== "program-clip") return;
  const clip = project.programTimeline.clips.find((item) => item.id === target.clipId);
  assert(Boolean(clip) && clip!.sourceId === target.sourceId, `Unknown text clip target: ${overlay.id}`);
  assert(target.sourceStart >= clip!.sourceStart && target.sourceEnd <= clip!.sourceEnd + 0.001 && target.sourceEnd > target.sourceStart, `Text source interval exceeds clip: ${overlay.id}`);
}

function validateSubtitleTrack(project: VideoProject) {
  const track = project.subtitleTrack;
  assert(track.version === 1 && typeof track.visible === "boolean", "Invalid subtitle track.");
  validateSubtitleStyle(track.style);
  const ids = new Set<string>();
  track.cues.forEach((cue) => validateSubtitleCue(project, cue, ids));
  track.deletedCues.forEach((item) => { validateSubtitleCue(project, item.cue, ids); assert(Number.isInteger(item.formerIndex) && item.formerIndex >= 0 && Boolean(Date.parse(item.deletedAt)), `Invalid deleted subtitle context: ${item.cue.id}`); });
}

function validateSubtitleCue(project: VideoProject, cue: SubtitleCue, ids: Set<string>) {
  assert(/^subtitle\.[a-z0-9.-]+$/.test(cue.id) && !ids.has(cue.id), `Invalid subtitle cue id: ${cue.id}`);
  assert(cue.text.trim().length > 0 && cue.text.length <= 500, `Invalid subtitle cue text: ${cue.id}`);
  assert(cue.target.type === "selected-cut" && cue.target.start >= 0 && cue.target.end > cue.target.start, `Invalid subtitle interval: ${cue.id}`);
  assert(project.mediaLibrary.sources.some((source) => source.id === cue.provenance.sourceId), `Unknown subtitle source: ${cue.id}`);
  assert(cue.provenance.clipId.startsWith("clip.") && cue.provenance.sourceStart >= 0 && cue.provenance.sourceEnd > cue.provenance.sourceStart, `Invalid subtitle provenance: ${cue.id}`);
  assert(cue.provenance.wordStart >= 0 && cue.provenance.wordEnd >= cue.provenance.wordStart, `Invalid subtitle word interval: ${cue.id}`);
  ids.add(cue.id);
}

function validateSubtitleStyle(style: SubtitleStyle) {
  assert(["system-sans", "classic-social", "tiktok-sans"].includes(style.fontFamily) && [400, 600, 700].includes(style.fontWeight), "Invalid subtitle font.");
  assert(style.fontSize >= 12 && style.fontSize <= 240 && style.strokeWidth >= 0 && style.strokeWidth <= 12, "Invalid subtitle typography.");
  assert(style.x >= 0 && style.x <= 1 && style.y >= 0 && style.y <= 1 && style.maxWidth > 0 && style.maxWidth <= 1, "Invalid subtitle placement.");
  assert(Number.isInteger(style.layer) && style.opacity >= 0 && style.opacity <= 1 && style.anchor === "bottom", "Invalid subtitle compositing style.");
}

function validateRecordingPlan(project: VideoProject) {
  const plan = project.recordingPlan;
  assert(plan !== undefined, "Recording plan is missing.");
  assert(plan.version === 1 && project.mediaLibrary.sources.some((source) => source.id === plan.sourceId), "Invalid recording plan source.");
  assert(plan.sourceLabel.trim().length > 0 && plan.outputs.length > 0, "Recording plan requires a source label and outputs.");
  const ids = new Set<string>();
  plan.outputs.forEach((output) => {
    assert(!ids.has(output.id) && /^output\.[a-z0-9.]+$/.test(output.id), `Invalid recording output id: ${output.id}`);
    assert(/^[a-z0-9-]+$/.test(output.projectId) && output.projectTitle.trim().length > 0, `Invalid recording output project: ${output.id}`);
    assert(["new", "existing"].includes(output.intent) && ["planned", "ready"].includes(output.status), `Invalid recording output state: ${output.id}`);
    assert(output.sourceRanges.every((range) => range.start >= 0 && range.end > range.start), `Invalid recording output ranges: ${output.id}`);
    ids.add(output.id);
  });
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
  assert(source.rawMediaId === undefined || source.rawMediaId === null || /^raw\.[a-f0-9]{16}$/.test(source.rawMediaId), `Invalid raw media reference: ${source.id}`);
  if (source.cache) validateMediaCache(source.cache, source.id);
  if (source.transcript) validateMediaTranscript(source.transcript, source.id);
  if (source.metadata) validateMediaMetadata(source.metadata, source.id);
  ids.add(source.id);
}

function validateMediaTranscript(transcript: MediaTranscriptReference, sourceId: string) {
  assert(transcript.version === 1 && /^cache\/transcripts\/[a-f0-9]{64}\.json$/.test(transcript.artifactPath), `Unsafe media transcript path: ${sourceId}`);
  assert(transcript.language.trim().length > 0 && Number.isInteger(transcript.wordCount) && transcript.wordCount >= 0, `Invalid media transcript: ${sourceId}`);
}

function validateVideoOverlay(project: VideoProject, overlay: VideoOverlay) {
  assert(/^video-overlay\.[a-z0-9.-]+$/.test(overlay.id) && overlay.kind === "video", `Invalid video overlay id: ${overlay.id}`);
  assert(project.mediaLibrary.sources.some((source) => source.id === overlay.sourceId), `Unknown video overlay source: ${overlay.id}`);
  assert(overlay.sourceStart >= 0 && overlay.sourceEnd > overlay.sourceStart, `Invalid video overlay source interval: ${overlay.id}`);
  const sourceDuration = project.mediaLibrary.sources.find((source) => source.id === overlay.sourceId)?.metadata?.duration;
  assert(sourceDuration === undefined || sourceDuration === null || overlay.sourceEnd <= sourceDuration + 0.001, `Video overlay exceeds source media: ${overlay.id}`);
  assert(overlay.target.type === "selected-cut" && overlay.target.start >= 0 && overlay.target.end > overlay.target.start, `Invalid video overlay target: ${overlay.id}`);
  assert(overlay.target.end - overlay.target.start <= overlay.sourceEnd - overlay.sourceStart + 0.001, `Video overlay target exceeds source duration: ${overlay.id}`);
  validateOverlayLayout(overlay.layout, overlay.id);
  assert(Number.isInteger(overlay.layer) && overlay.opacity >= 0 && overlay.opacity <= 1 && typeof overlay.muted === "boolean", `Invalid video overlay layer/opacity: ${overlay.id}`);
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
  (project.programTimeline.deletedClips || []).forEach((deleted) => {
    validateProgramClip(project, deleted.clip, ids);
    assert(Number.isInteger(deleted.formerIndex) && deleted.formerIndex >= 0 && deleted.formerProgramStart >= 0 && deleted.formerProgramEnd > deleted.formerProgramStart, `Invalid deleted clip context: ${deleted.clip.id}`);
    assert(Boolean(deleted.editorialState?.overlays && deleted.editorialState?.videoOverlays && deleted.editorialState?.textOverlays), `Missing deleted clip editorial state: ${deleted.clip.id}`);
    deleted.editorialState.overlays.forEach((overlay) => validateOverlay(project, overlay));
    deleted.editorialState.videoOverlays.forEach((overlay) => validateVideoOverlay(project, overlay));
    deleted.editorialState.textOverlays.forEach((overlay) => validateTextOverlay(project, overlay));
  });
}

function validateProgramClip(project: VideoProject, clip: ProgramClip, ids: Set<string>) {
  assert(!ids.has(clip.id) && /^clip\.[a-z0-9.-]+$/.test(clip.id), `Invalid program clip id: ${clip.id}`);
  assert(project.mediaLibrary.sources.some((source) => source.id === clip.sourceId), `Unknown program clip source: ${clip.id}`);
  assert(clip.label.trim().length > 0 && clip.sourceStart >= 0 && clip.sourceEnd - clip.sourceStart >= 0.08, `Invalid program clip interval: ${clip.id}`);
  if (clip.kind === "scene") validateSceneClip(project, clip);
  else assert(clip.kind === "source" && clip.sceneId === null && clip.takeId === null, `Invalid source clip: ${clip.id}`);
  ids.add(clip.id);
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
  const supported = (processing.provider === "rembg-u2net-human" && processing.providerVersion === "1.0.0") || (processing.provider === "rembg-u2net-human-coreml" && processing.providerVersion === "2.0.0");
  assert(supported, `Unsupported cutout provider: ${overlay.id}`);
  assert(["queued", "processing", "ready", "failed"].includes(processing.status), `Invalid cutout status: ${overlay.id}`);
  assert(processing.recipePath === `${root}recipe.json`, `Unsafe cutout recipe path: ${overlay.id}`);
  assert(processing.previewPath === null || processing.previewPath === `${root}preview.webm`, `Unsafe cutout preview path: ${overlay.id}`);
  assert(processing.renderPath === null || processing.renderPath === `${root}render.mov`, `Unsafe cutout render path: ${overlay.id}`);
  assert(processing.statusPath === undefined || processing.statusPath === null || processing.statusPath === `${root}status.json`, `Unsafe cutout status path: ${overlay.id}`);
  assert(processing.progress === undefined || (processing.progress >= 0 && processing.progress <= 1), `Invalid cutout progress: ${overlay.id}`);
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
  assert((receipt.qualityProfile!.crf === 14 && receipt.qualityProfile!.preset === "slow") || (receipt.qualityProfile!.crf === 18 && receipt.qualityProfile!.preset === "veryfast") || (receipt.qualityProfile!.encoder === "h264_videotoolbox" && receipt.qualityProfile!.preset === "hardware" && receipt.qualityProfile!.crf === null), "Unsupported export quality profile.");
}

function validateExportPreset(receipt: ExportReceipt) {
  assert(Boolean(receipt.preset && receipt.strategy && receipt.container), "Missing export preset metadata.");
  assert(receipt.preset !== "original-format" || (receipt.codec.video === "hevc" && receipt.container === "mov" && receipt.strategy === "stream-copy"), "Original-format export must preserve HEVC/MOV by stream copy.");
  assert(receipt.preset !== "tiktok-60" || Boolean(receipt.codec.video === "h264" && receipt.container === "mp4" && receipt.strategy === "full-transcode" && receipt.qualityProfile), "Invalid TikTok export receipt.");
  assert(receipt.preset !== "tiktok-software" || Boolean(receipt.codec.video === "h264" && receipt.container === "mp4" && receipt.strategy === "full-transcode" && receipt.qualityProfile?.encoder === "libx264"), "Invalid software export receipt.");
  assert(receipt.preset !== "lan-review" || Boolean(receipt.codec.video === "h264" && receipt.container === "mp4" && receipt.strategy === "full-transcode" && receipt.qualityProfile?.encoder === "h264_videotoolbox"), "Invalid LAN review receipt.");
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
  validateOverlayLayout(overlay.layout, overlay.id);
  assert(Number.isInteger(overlay.layer) && overlay.opacity >= 0 && overlay.opacity <= 1, `Invalid overlay layer/opacity: ${overlay.id}`);
  if (overlay.target.type === "take") validateTakeTarget(project, overlay);
}

function validateOverlayLayout(layout: OverlayLayout, id: string) {
  assert(layout.x >= 0 && layout.x <= 1 && layout.y >= 0 && layout.y <= 1, `Invalid overlay position: ${id}`);
  assert(layout.width > 0 && layout.width <= 1, `Invalid overlay width: ${id}`);
  assert(layout.height === null || (layout.height > 0 && layout.height <= 1), `Invalid overlay height: ${id}`);
  assert(["contain", "cover"].includes(layout.fit), `Invalid overlay fit: ${id}`);
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
  const primary: VideoMediaSource = { id: "media.primary", kind: "video", role: "instruction", label: project.sourceName || project.title || "Primary source", rawMediaId: null, origin: { type: "local", path: project.sourcePath }, cache: null, metadata: null, createdAt: project.createdAt || "" };
  return { version: 1, primarySourceId: primary.id, sources: [primary] };
}

function normalizeMediaLibrary(library: MediaLibrary): MediaLibrary {
  return { ...library, sources: library.sources.map((source) => ({ ...source, rawMediaId: source.rawMediaId || null })) };
}

const emptySource = { sourceUrl: null, attribution: null, license: null };

import type { AssetSource, ExportCadence, ExportReceipt, ImageOverlay, MediaLibrary, MediaTranscriptReference, OverlayLayout, PitchAnalysisReference, ProgramClip, RemoteMediaCache, SubjectCutoutOverlay, SubtitleCue, SubtitleStyle, TextOverlay, VideoMediaMetadata, VideoMediaSource, VideoOverlay, VideoProject } from "../src/analysis-model";
import { createProgramTimeline } from "../src/ProgramTimelineModel";
import { recordingPlanForProject } from "../src/RecordingPlanModel";
import { normalizeSubtitleTrack } from "../src/SubtitleModel";
