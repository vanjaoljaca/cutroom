describe("text overlay position keyboard controls", () => {
  it("maps arrow keys to normalized coordinate nudges", () => {
    expect(textPositionNudge("ArrowLeft", 0.01)).toEqual({ x: -0.01, y: 0 });
    expect(textPositionNudge("ArrowDown", 0.05)).toEqual({ x: 0, y: 0.05 });
    expect(textPositionNudge("Enter", 0.01)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { textPositionNudge } from "./TextOverlayEditors";
