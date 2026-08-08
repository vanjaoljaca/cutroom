describe("source-preserving export planner", () => {
  it("copies only complete untouched HEVC GOPs and blocks unsafe hybrid output", () => {
    const plan = planSourcePreservingExport({ projectId: "p", source, cuts: [{ id: "cut", start: 12.12, end: 14.64 }], overlays: [{ id: "image", start: 1.98, end: 2.52 }], keyframes: [12.133333, 13.066667, 14] });
    expect(plan.strategy).toBe("partial-transcode");
    expect(plan.supported).toBe(false);
    expect(plan.spans.some((span) => span.mode === "stream-copy")).toBe(true);
    expect(plan.spans.some((span) => span.reasons.includes("burned-in image overlay modifies pixels"))).toBe(true);
  });

  it("allows a pure HEVC/MOV stream copy when every boundary is random access", () => {
    const plan = planSourcePreservingExport({ projectId: "p", source, cuts: [{ id: "cut", start: 12, end: 14 }], overlays: [], keyframes: [12, 13, 14] });
    expect(plan).toMatchObject({ strategy: "stream-copy", supported: true, blocker: null });
  });
});

const source = { path: "/source.mov", container: "mov", videoCodec: "hevc", videoTag: "hvc1", audioCodec: "aac", averageFps: 60, width: 1080, height: 1920, rotation: -90, color: "bt709" } as const;

import { planSourcePreservingExport } from "./SourcePreservingExportPlanner";
