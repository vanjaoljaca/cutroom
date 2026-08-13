import { describe, expect, it } from "vitest";
import { cutoutProgramInterval, cutoutWithProgramInterval } from "./CutoutOverlayModel";
import type { SubjectCutoutOverlay } from "./analysis-model";
import type { SourceRange } from "./editor-model";

describe("cutout program timing", () => {
  it("maps a clip-relative cutout into assembled movie time", () => {
    expect(cutoutProgramInterval(overlay, ranges)).toMatchObject({ start: 2.5, end: 3.5, rangeIndex: 1 });
  });

  it("persists timeline edits as clip-relative timing", () => {
    const target = cutoutWithProgramInterval(overlay, ranges, 2.7, 3.2).target;
    expect(target.start).toBeCloseTo(0.7);
    expect(target.end).toBeCloseTo(1.2);
  });
});

const ranges: SourceRange[] = [
  { id: "clip.one", order: 1, start: 10, end: 12 },
  { id: "clip.two", order: 2, start: 4, end: 7 },
];
const overlay: SubjectCutoutOverlay = { id: "cutout.one", kind: "subject-cutout", label: "Me", sourceId: "media.primary", sourceStart: 1, sourceEnd: 2, target: { type: "program-clip", clipId: "clip.two", start: 0.5, end: 1.5 }, layout: { anchor: "top-left", x: 0.6, y: 0.5, width: 0.3, height: null, fit: "contain", placementIntent: "explicit" }, crop: { top: 0, right: 0, bottom: 0, left: 0 }, layer: 20, opacity: 1, processing: { provider: "rembg-u2net-human", providerVersion: "1.0.0", status: "ready", previewPath: "derived/cutouts/cutout.one/preview.webm", renderPath: "derived/cutouts/cutout.one/render.mov", recipePath: "derived/cutouts/cutout.one/recipe.json", error: null }, createdAt: "2026-08-08T00:00:00.000Z" };
