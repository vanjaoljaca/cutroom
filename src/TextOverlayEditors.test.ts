describe("text overlay position keyboard controls", () => {
  it("maps arrow keys to normalized coordinate nudges", () => {
    expect(textPositionNudge("ArrowLeft", 0.01)).toEqual({ x: -0.01, y: 0 });
    expect(textPositionNudge("ArrowDown", 0.05)).toEqual({ x: 0, y: 0.05 });
    expect(textPositionNudge("Enter", 0.01)).toBeNull();
  });
  it("keeps font, stroke, and shadow source-pixel values on one responsive scale", () => {
    expect(sourcePixelCss(100)).toBe("9.25925925925926cqw");
    expect(Number.parseFloat(sourcePixelCss(4)) / Number.parseFloat(sourcePixelCss(100))).toBeCloseTo(0.04);
  });
});

import { describe, expect, it } from "vitest";
import { sourcePixelCss, textPositionNudge } from "./TextOverlayEditors";
