describe("video export quality contract", () => {
  it("uses a transparent deterministic TikTok profile at exactly 60 fps", () => {
    const args = videoEncodingArgs();
    expect(args).toEqual(expect.arrayContaining(["slow", "14", "high", "4.2", "yuv420p", "cfr", "bt709", "60"]));
    expect(args).not.toContain("30");
  });

  it("offers an explicit faster review profile without dropping cadence", () => {
    const args = videoEncodingArgs(hardwareReviewProfile);
    expect(args).toEqual(expect.arrayContaining(["h264_videotoolbox", "24M", "60", "cfr", "bt709"]));
    expect(args).not.toContain("-allow_sw");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("30");
  });

  it("uses a lightweight 30 fps hardware profile for LAN review", () => {
    const args = videoEncodingArgs({ ...hardwareReviewProfile, fpsMode: "cfr-30" }, "lan-review");
    expect(args).toEqual(expect.arrayContaining(["h264_videotoolbox", "6M", "30", "cfr", "bt709"]));
    expect(args).not.toContain("-allow_sw");
  });

  it("seeks each sparse program clip before decoding instead of scanning source gaps", () => {
    const project = { mediaLibrary: { primarySourceId: "media.primary", sources: [{ id: "media.primary", origin: { type: "local", path: "/media/source.mov" }, metadata: { audioCodec: "aac" } }] }, assetLibrary: { assets: [], bundles: [] }, overlays: [], cutoutOverlays: [], videoOverlays: [], textOverlays: [], subtitleTrack: { cues: [], style: {} } } as unknown as VideoProject;
    const cuts = [{ sourceId: "media.primary", start: 10, end: 12 }, { sourceId: "media.primary", start: 900, end: 903 }] as any;
    const command = buildExportCommand(project, cuts, { width: 1080, height: 1920, averageFrameRate: 60 } as any, "/tmp/review.mp4", hardwareReviewProfile, "lan-review");
    expect(command.join(" ")).toContain("-ss 10.000000 -t 2.000000 -i /media/source.mov -ss 900.000000 -t 3.000000 -i /media/source.mov");
    expect(command.join(" ")).not.toContain("trim=start=900");
  });

  it("replaces a screen clip's audio with its synchronized camera interval", () => {
    const audioSource = { sourceId: "media.primary", sourceStart: 347.92, sourceEnd: 352.96, volume: 1, muted: false, subjectTrackId: "subject.vanja" };
    const project = { mediaLibrary: { primarySourceId: "media.primary", sources: [{ id: "media.primary", origin: { type: "local", path: "/media/camera.mov" }, metadata: { audioCodec: "aac" } }, { id: "media.screen", origin: { type: "local", path: "/media/screen.mp4" }, metadata: { audioCodec: "aac" } }] }, programTimeline: { clips: [{ id: "clip.one", audioSource }] }, assetLibrary: { assets: [], bundles: [] }, overlays: [], cutoutOverlays: [], videoOverlays: [], textOverlays: [], subtitleTrack: { cues: [], style: {} } } as unknown as VideoProject;
    const cuts = [{ clipId: "clip.one", sourceId: "media.screen", start: 62.8, end: 67.84 }] as any;
    const command = buildExportCommand(project, cuts, { width: 1080, height: 1920, averageFrameRate: 60 } as any, "/tmp/review.mp4", hardwareReviewProfile, "lan-review");
    expect(command.join(" ")).toContain("-ss 347.920000 -t 5.040000 -i /media/camera.mov");
    expect(command.join(" ")).toMatch(/\[1:a:0\]atrim=start=0:end=5\.04/);
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

  it("crops a cutout before fitting it into the persisted placement width", () => {
    const overlay = { layout: { x: 0.1, y: 0.2, width: 0.3, height: null, fit: "contain" }, crop: { top: 0, right: 0, bottom: 0.2, left: 0 }, opacity: 1 };
    const filters = cutoutOverlayFilter({ overlay, start: 2, end: 4 } as any, 0, 3, 1080, 1920);
    expect(filters[0]).toContain("crop=trunc(iw*1/2)*2:trunc(ih*0.8/2)*2");
    expect(filters[0].indexOf("crop=")).toBeLessThan(filters[0].indexOf("scale=324:-2"));
  });

  it("wraps long Unicode titles inside the export max width with explicit box padding", () => {
    const overlay = { text: "Demonstration incoming…", style: { fontSize: 64, align: "center", strokeColor: null, backgroundColor: "#111111", shadow: false, color: "#FFFFFF" }, layout: { x: 0.5, y: 0.58, anchor: "center", maxWidth: 0.82 }, opacity: 1 };
    const filter = textOverlayFilter({ overlay, start: 0, end: 2 } as any, 0, "video", 720, 1280);
    expect(filter).toContain("Demonstration\nincoming…");
    expect(filter).toContain("boxborderw=18");
  });
});

import type { VideoProject } from "../src/analysis-model";
import { buildExportCommand, cutoutOverlayFilter, hardwareReviewProfile, projectSnapshotHash, textOverlayFilter, validateCadence, videoEncodingArgs } from "./VideoExportPipeline";
