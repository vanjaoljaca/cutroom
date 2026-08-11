describe("video overlay program timing", () => {
  it("moves globally without changing its source interval", () => {
    expect(videoOverlayWithProgramInterval(overlay, ranges, 2, 4)).toMatchObject({ sourceStart: 5, sourceEnd: 7, target: { start: 2, end: 4 } });
  });

  it("trims the matching source edge", () => {
    expect(videoOverlayWithProgramInterval(overlay, ranges, 1.5, 3)).toMatchObject({ sourceStart: 5.5, sourceEnd: 7 });
    expect(videoOverlayWithProgramInterval(overlay, ranges, 1, 2.5)).toMatchObject({ sourceStart: 5, sourceEnd: 6.5 });
  });
});

const overlay = { id: "video-overlay.demo", kind: "video", label: "Demo", sourceId: "media.demo", sourceStart: 5, sourceEnd: 7, target: { type: "selected-cut", start: 1, end: 3 }, layout: { anchor: "top-left", x: 0.04, y: 0.04, width: 0.3, height: null, fit: "contain", placementIntent: "avoid-face-left" }, layer: 2, opacity: 1, muted: true, createdAt: "" } as const;
const ranges = [{ id: "clip.one", kind: "source" as const, sourceId: "media.primary", label: "One", start: 0, end: 10, sourceStart: 0, sourceEnd: 10, order: 0 }];

import { describe, expect, it } from "vitest";
import { videoOverlayWithProgramInterval } from "./VideoOverlayModel";
