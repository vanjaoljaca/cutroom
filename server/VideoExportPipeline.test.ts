describe("video export quality contract", () => {
  it("uses a transparent deterministic TikTok profile at exactly 60 fps", () => {
    const args = videoEncodingArgs();
    expect(args).toEqual(expect.arrayContaining(["slow", "14", "high", "4.2", "yuv420p", "cfr", "bt709", "60"]));
    expect(args).not.toContain("30");
  });

  it("offers an explicit faster review profile without dropping cadence", () => {
    const args = videoEncodingArgs(hardwareReviewProfile);
    expect(args).toEqual(expect.arrayContaining(["h264_videotoolbox", "24M", "60", "cfr", "bt709", "1"]));
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

  it("wraps long Unicode titles inside the export max width with explicit box padding", () => {
    const overlay = { text: "Demonstration incoming…", style: { fontSize: 64, align: "center", strokeColor: null, backgroundColor: "#111111", shadow: false, color: "#FFFFFF" }, layout: { x: 0.5, y: 0.58, anchor: "center", maxWidth: 0.82 }, opacity: 1 };
    const filter = textOverlayFilter({ overlay, start: 0, end: 2 } as any, 0, "video", 720, 1280);
    expect(filter).toContain("Demonstration\nincoming…");
    expect(filter).toContain("boxborderw=18");
  });
});

import type { VideoProject } from "../src/analysis-model";
import { hardwareReviewProfile, projectSnapshotHash, textOverlayFilter, validateCadence, videoEncodingArgs } from "./VideoExportPipeline";
