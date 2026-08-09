describe("image bundle selection", () => {
  it("atomically switches the bundle and attached overlay asset", () => {
    const project = fixtureProject();
    const selected = selectImageBundleCandidate(project, "bundle-options", "image-2");
    expect(selected.assetLibrary.bundles[0].selectedAssetId).toBe("image-2");
    expect(selected.overlays[0].assetId).toBe("image-2");
    expect(selected.overlays[0].layout.height).toBeNull();
    expect(project.overlays[0].assetId).toBe("image-1");
  });

  it("migrates image overlays to intrinsic aspect ratio", () => {
    const normalized = normalizeImageOverlayHeights(fixtureProject());
    expect(normalized.overlays[0].layout.height).toBeNull();
  });

  it("rejects assets outside the bundle", () => {
    expect(() => selectImageBundleCandidate(fixtureProject(), "bundle-options", "missing")).toThrow("not a candidate");
  });
});

function fixtureProject(): VideoProject {
  return { assetLibrary: { version: 1, assets: [], bundles: [{ id: "bundle-options", kind: "image-candidates", label: "Options", source: { sourceUrl: null, attribution: null, license: null }, candidateAssetIds: ["image-1", "image-2"], selectedAssetId: "image-1", createdAt: "" }] }, overlays: [{ id: "overlay", kind: "image", assetId: "image-1", bundleId: "bundle-options", layout: { height: 0.4 } }] } as unknown as VideoProject;
}

import type { VideoProject } from "./analysis-model";
import { normalizeImageOverlayHeights, selectImageBundleCandidate } from "./ImageBundleModel";
