describe("video export quality contract", () => {
  it("uses a transparent deterministic TikTok profile at exactly 60 fps", () => {
    const args = videoEncodingArgs();
    expect(args).toEqual(expect.arrayContaining(["slow", "14", "high", "4.2", "yuv420p", "cfr", "bt709", "60"]));
    expect(args).not.toContain("30");
  });

  it("accepts the source cadence and rejects silent 60-to-30 fps regression", () => {
    expect(() => validateCadence(59.996, 59.998)).not.toThrow();
    expect(() => validateCadence(59.996, 30)).toThrow("source cadence 59.996 fps became 30.000 fps");
  });

  it("includes subject cutouts in the project snapshot identity", () => {
    const base = { mediaLibrary: {}, programTimeline: {}, overlays: [], cutoutOverlays: [], assetLibrary: { bundles: [] } } as unknown as VideoProject;
    const changed = { ...base, cutoutOverlays: [{ id: "cutout.person" }] } as unknown as VideoProject;
    expect(projectSnapshotHash(base)).not.toBe(projectSnapshotHash(changed));
  });
});

import type { VideoProject } from "../src/analysis-model";
import { projectSnapshotHash, validateCadence, videoEncodingArgs } from "./VideoExportPipeline";
