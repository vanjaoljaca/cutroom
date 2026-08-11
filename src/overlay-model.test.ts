describe("image overlay visibility", () => {
  it("shows a take overlay only while its selected take interval plays", () => {
    const project = fixtureProject();
    expect(visibleImageOverlays(project, "cut", 12.7, 4).map((overlay) => overlay.id)).toEqual(["take-overlay"]);
    expect(visibleImageOverlays(project, "cut", 15, 4)).toEqual([]);
  });

  it("shows selected-cut overlays by assembled time and never in original mode", () => {
    const project = fixtureProject();
    expect(visibleImageOverlays(project, "cut", 0, 1.5).map((overlay) => overlay.id)).toEqual(["cut-overlay"]);
    expect(visibleImageOverlays(project, "original", 12.7, 1.5)).toEqual([]);
  });

  it("maps take-relative image timing onto the assembled cut", () => {
    const project = fixtureProject();
    const ranges: SourceRange[] = [
      { id: "opening", order: 1, start: 20, end: 23, sceneId: "opening", takeId: "take-1" },
      { id: "scene-take-2", order: 2, start: 12, end: 15, sceneId: "scene", takeId: "take-2" },
      { id: "final", order: 3, start: 30, end: 32, sceneId: "final", takeId: "take-1" },
    ];
    expect(imageOverlayCutIntervals(project, ranges).map(({ overlay, start, end }) => [overlay.id, start, end])).toEqual([
      ["take-overlay", 3.5, 4.5],
      ["cut-overlay", 1, 2],
    ]);
  });

  it("writes assembled timing back to a take-relative overlay", () => {
    const project = fixtureProject();
    const ranges: SourceRange[] = [
      { id: "opening", order: 1, start: 20, end: 23, sceneId: "opening", takeId: "take-1" },
      { id: "scene-take-2", order: 2, start: 12, end: 15, sceneId: "scene", takeId: "take-2" },
      { id: "final", order: 3, start: 30, end: 32, sceneId: "final", takeId: "take-1" },
    ];
    expect(imageOverlayWithCutInterval(project.overlays[0], ranges, 3.25, 5).target).toEqual({ type: "take", sceneId: "scene", takeId: "take-2", start: 0.25, end: 2 });
    expect(imageOverlayWithCutInterval(project.overlays[0], ranges, 3.25, 6.2).target).toEqual({ type: "selected-cut", start: 3.25, end: 6.2 });
  });
});

function fixtureProject(): VideoProject {
  const take = { id: "take-2", order: 2, start: 12, end: 15, label: "Take 2", reason: "", transcript: "", confidence: 1, selected: true };
  const overlays: ImageOverlay[] = [
    { id: "take-overlay", kind: "image", assetId: "asset", bundleId: null, label: "Take", target: { type: "take", sceneId: "scene", takeId: "take-2", start: 0.5, end: 1.5 }, layout: layout(), layer: 2, opacity: 1, createdAt: "2026-01-01" },
    { id: "cut-overlay", kind: "image", assetId: "asset", bundleId: null, label: "Cut", target: { type: "selected-cut", start: 1, end: 2 }, layout: layout(), layer: 1, opacity: 1, createdAt: "2026-01-01" },
  ];
  return { schemaVersion: 1, revision: 0, id: "project", title: "", sourcePath: "/tmp/source.mov", sourceName: "source.mov", createdAt: "", provider: "fluid-audio", model: "parakeet-tdt-0.6b-v2", transcript: "", words: [], requestSummary: "", scenes: [{ id: "scene", order: 1, label: "Scene", reason: "", takes: [take] }], cuts: [{ ...take, id: "scene-take-2" }], artifactsDirectory: "", mediaLibrary: { version: 1, primarySourceId: "media.primary", sources: [{ id: "media.primary", kind: "video", role: "instruction", label: "source.mov", origin: { type: "local", path: "/tmp/source.mov" }, cache: null, metadata: null, createdAt: "" }] }, programTimeline: { version: 1, clips: [{ id: "clip.scene.scene", kind: "scene", sourceId: "media.primary", label: "Scene", sourceStart: 2, sourceEnd: 4, sceneId: "scene", takeId: "take", createdAt: "" }] }, editorPreferences: { timelineWindow: "auto" }, assetLibrary: { version: 1, assets: [{ id: "asset", kind: "image", label: "", originalName: "a.png", relativePath: "assets/asset.png", mimeType: "image/png", width: 10, height: 10, bytes: 10, sha256: "a", importedAt: "", source: { sourceUrl: null, attribution: null, license: null } }], bundles: [] }, overlays, cutoutOverlays: [], videoOverlays: [], textOverlays: [], pitchAnalysis: null, exportHistory: [] };
}

function layout(): OverlayLayout {
  return { anchor: "top-left", x: 0.1, y: 0.1, width: 0.3, height: null, fit: "contain", placementIntent: "explicit" };
}

import type { ImageOverlay, OverlayLayout, VideoProject } from "./analysis-model";
import type { SourceRange } from "./editor-model";
import { imageOverlayCutIntervals, imageOverlayWithCutInterval, visibleImageOverlays } from "./overlay-model";
