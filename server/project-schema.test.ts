describe("video project schema", () => {
  it("normalizes projects created before asset support", () => {
    const normalized = normalizeVideoProject({ id: "old" } as VideoProject);
    expect(normalized).toMatchObject({ schemaVersion: 1, revision: 0, mediaLibrary: { version: 1, primarySourceId: "media.primary" }, assetLibrary: { version: 1, assets: [], bundles: [] }, overlays: [], pitchAnalysis: null, exportHistory: [] });
  });

  it("migrates single-asset overlays without bundle metadata", () => {
    const legacy = fixtureProject() as unknown as Record<string, any>;
    delete legacy.assetLibrary.bundles;
    delete legacy.assetLibrary.assets[0].source;
    delete legacy.overlays[0].bundleId;
    const normalized = normalizeVideoProject(legacy as VideoProject);
    expect(normalized.assetLibrary.bundles).toEqual([]);
    expect(normalized.assetLibrary.assets[0].source).toEqual({ sourceUrl: null, attribution: null, license: null });
    expect(normalized.overlays[0].bundleId).toBeNull();
  });

  it("invalidates a legacy pitch cache deterministically", () => {
    const project = fixtureProject() as unknown as Record<string, any>;
    project.pitchAnalysis = { version: 1, artifactPath: "analysis/pitch-v1.json", algorithm: "normalized-autocorrelation", algorithmVersion: "1.0.0" };
    expect(normalizeVideoProject(project as VideoProject).pitchAnalysis).toBeNull();
  });

  it("accepts a validated take overlay", () => {
    expect(validateVideoProject(fixtureProject()).overlays).toHaveLength(1);
  });

  it("rejects missing assets and out-of-range take intervals", () => {
    const missing = fixtureProject();
    missing.overlays[0].assetId = "missing";
    expect(() => validateVideoProject(missing)).toThrow("Unknown overlay asset");
    const tooLong = fixtureProject();
    tooLong.overlays[0].target.end = 4;
    expect(() => validateVideoProject(tooLong)).toThrow("Overlay exceeds take duration");
  });

  it("validates bundle membership and matching overlay selection", () => {
    const project = fixtureProject();
    project.assetLibrary.bundles = [{ id: "bundle-options", kind: "image-candidates", label: "Options", source: { sourceUrl: null, attribution: null, license: null }, candidateAssetIds: ["image-123"], selectedAssetId: "image-123", createdAt: "" }];
    project.overlays[0].bundleId = "bundle-options";
    expect(validateVideoProject(project).overlays[0].assetId).toBe("image-123");
    project.assetLibrary.bundles[0].selectedAssetId = null;
    expect(() => validateVideoProject(project)).toThrow("does not match bundle selection");
  });

  it("preserves movie-level overlay timing when the selected cut is temporarily shorter", () => {
    const project = fixtureProject();
    project.overlays[0].target = { type: "selected-cut", start: 1, end: 8 };
    expect(validateVideoProject(project).overlays[0].target).toEqual({ type: "selected-cut", start: 1, end: 8 });
  });

  it("accepts a regenerable remote video source with a disposable cache", () => {
    const project = fixtureProject();
    project.mediaLibrary.sources.push({ id: "media.reference.1234abcd", kind: "video", role: "reference", label: "Referenced post", origin: { type: "remote", url: "https://example.com/post.mov" }, cache: { relativePath: `cache/media/${"a".repeat(64)}.mov`, sha256: "a".repeat(64), bytes: 400, cachedAt: "" }, metadata: { duration: 12, width: 1080, height: 1920, averageFps: 60, videoCodec: "hevc", audioCodec: "aac", container: "mov" }, createdAt: "" });
    expect(validateVideoProject(project).mediaLibrary.sources).toHaveLength(2);
    project.mediaLibrary.sources[1].cache = null;
    expect(validateVideoProject(project).mediaLibrary.sources[1].cache).toBeNull();
  });

  it("accepts a ready subject cutout with deterministic USB-relative artifacts", () => {
    const project = fixtureProject();
    project.cutoutOverlays.push({ id: "cutout.person", kind: "subject-cutout", label: "Me", sourceId: "media.primary", sourceStart: 1, sourceEnd: 1.5, target: { type: "program-clip", clipId: "clip.scene.scene", start: 0.1, end: 0.6 }, layout: { anchor: "top-left", x: 0.6, y: 0.5, width: 0.3, height: null, fit: "contain", placementIntent: "explicit" }, crop: { top: 0, right: 0, bottom: 0, left: 0 }, layer: 20, opacity: 1, processing: { provider: "rembg-u2net-human", providerVersion: "1.0.0", status: "ready", previewPath: "derived/cutouts/cutout.person/preview.webm", renderPath: "derived/cutouts/cutout.person/render.mov", recipePath: "derived/cutouts/cutout.person/recipe.json", error: null }, createdAt: "" });
    expect(validateVideoProject(project).cutoutOverlays).toHaveLength(1);
    project.cutoutOverlays[0].processing.renderPath = "../outside.mov";
    expect(() => validateVideoProject(project)).toThrow("Unsafe cutout render path");
  });

  it("normalizes legacy cutouts and rejects an empty crop", () => {
    const project = fixtureProject();
    project.cutoutOverlays.push({ id: "cutout.person", kind: "subject-cutout", label: "Me", sourceId: "media.primary", sourceStart: 1, sourceEnd: 1.5, target: { type: "program-clip", clipId: "clip.scene.scene", start: 0.1, end: 0.6 }, layout: { anchor: "top-left", x: 0.6, y: 0.5, width: 0.3, height: null, fit: "contain", placementIntent: "explicit" }, crop: { top: 0, right: 0, bottom: 0, left: 0 }, layer: 20, opacity: 1, processing: { provider: "rembg-u2net-human", providerVersion: "1.0.0", status: "ready", previewPath: "derived/cutouts/cutout.person/preview.webm", renderPath: "derived/cutouts/cutout.person/render.mov", recipePath: "derived/cutouts/cutout.person/recipe.json", error: null }, createdAt: "" });
    delete (project.cutoutOverlays[0] as unknown as { crop?: unknown }).crop;
    delete project.cutoutOverlays[0].subjectTrackId;
    expect(validateVideoProject(project).cutoutOverlays[0]).toMatchObject({ subjectTrackId: "subject.me", crop: { top: 0, right: 0, bottom: 0, left: 0 } });
    project.cutoutOverlays[0].crop = { top: 0.5, right: 0, bottom: 0.5, left: 0 };
    expect(() => validateVideoProject(project)).toThrow("Invalid cutout crop");
  });

  it("validates durable deleted program segments and their editorial snapshot", () => {
    const project = fixtureProject();
    const clip = project.programTimeline.clips[0];
    project.programTimeline.clips = [];
    project.programTimeline.deletedClips = [{ clip, formerIndex: 0, previousClipId: null, nextClipId: null, formerProgramStart: 0, formerProgramEnd: 1, deletedAt: "now", editorialState: { overlays: project.overlays, videoOverlays: [], textOverlays: [] } }];
    expect(validateVideoProject(project).programTimeline.deletedClips?.[0].clip.id).toBe(clip.id);
    project.programTimeline.deletedClips[0].formerProgramEnd = 0;
    expect(() => validateVideoProject(project)).toThrow("Invalid deleted clip context");
  });
});

function fixtureProject(): VideoProject {
  const take = { id: "take", order: 1, start: 4, end: 6, label: "Take 1", reason: "", transcript: "", confidence: 1, selected: true };
  return { schemaVersion: 1, revision: 0, id: "project", title: "", sourcePath: "/tmp/source.mov", sourceName: "source.mov", createdAt: "", provider: "fluid-audio", model: "parakeet-tdt-0.6b-v2", transcript: "", words: [], requestSummary: "", scenes: [{ id: "scene", order: 1, label: "Scene", reason: "", takes: [take] }], cuts: [{ ...take, id: "scene-take" }], artifactsDirectory: "", mediaLibrary: { version: 1, primarySourceId: "media.primary", sources: [{ id: "media.primary", kind: "video", role: "instruction", label: "source.mov", origin: { type: "local", path: "/tmp/source.mov" }, cache: null, metadata: null, createdAt: "" }] }, programTimeline: { version: 1, clips: [{ id: "clip.scene.scene", kind: "scene", sourceId: "media.primary", label: "Scene", sourceStart: 0, sourceEnd: 1, sceneId: "scene", takeId: "take", createdAt: "" }] }, editorPreferences: { timelineWindow: "auto" }, assetLibrary: { version: 1, assets: [{ id: "image-123", kind: "image", label: "Image", originalName: "image.png", relativePath: "assets/image-123.png", mimeType: "image/png", width: 10, height: 10, bytes: 100, sha256: "abc", importedAt: "", source: { sourceUrl: null, attribution: null, license: null } }], bundles: [] }, overlays: [{ id: "overlay", kind: "image", assetId: "image-123", bundleId: null, label: "Overlay", target: { type: "take", sceneId: "scene", takeId: "take", start: 0, end: 1 }, layout: { anchor: "top-left", x: 0.1, y: 0.2, width: 0.3, height: null, fit: "contain", placementIntent: "avoid-face-left" }, layer: 10, opacity: 1, createdAt: "" }], cutoutOverlays: [], videoOverlays: [], textOverlays: [], subtitleTrack: emptySubtitleTrack(), pitchAnalysis: null, exportHistory: [] };
}

import type { VideoProject } from "../src/analysis-model";
import { normalizeVideoProject, validateVideoProject } from "./project-schema";
import { emptySubtitleTrack } from "../src/SubtitleModel";
