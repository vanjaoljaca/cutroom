import { describe, expect, it } from "vitest";
import { textOverlayProgramInterval, textOverlayWithProgramInterval } from "./TextOverlayModel";
import type { TextOverlay } from "./analysis-model";
import type { SourceRange } from "./editor-model";

describe("text overlay timing", () => {
  it("tracks a source interval through program rearrangement", () => {
    const interval = textOverlayProgramInterval(clipOverlay, reordered);
    expect(interval && [interval.start, interval.end]).toEqual([5.5, 6.5]);
  });

  it("writes dragged program timing back to source provenance", () => {
    const changed = textOverlayWithProgramInterval(clipOverlay, reordered, 5.25, 6.75);
    expect(changed.target).toMatchObject({ sourceStart: 10.25, sourceEnd: 11.75 });
  });
});

const reordered: SourceRange[] = [
  { id: "one", clipId: "one", order: 1, start: 20, end: 25, sourceId: "primary" },
  { id: "reference", clipId: "reference", order: 2, start: 10, end: 12, sourceId: "reference" },
];
const clipOverlay: TextOverlay = { id: "caption", kind: "text", role: "caption", text: "Hello", target: { type: "program-clip", clipId: "reference", sourceId: "reference", sourceStart: 10.5, sourceEnd: 11.5 }, layout: { anchor: "bottom", x: 0.5, y: 0.8, maxWidth: 0.8, safeZone: true }, style: { fontFamily: "system-sans", fontSize: 54, fontWeight: 700, color: "#ffffff", backgroundColor: null, strokeColor: "#000000", strokeWidth: 3, shadow: true, align: "center" }, layer: 30, opacity: 1, enabled: true, provenance: { sourceId: "reference", attribution: null }, createdAt: "2026-08-11T00:00:00.000Z" };
