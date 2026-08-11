describe("text layout", () => {
  it("keeps wrapped system-sans text and its final glyph inside padded bounds", () => {
    const wrapped = wrapTextForCanvas("Demonstration incoming…", 64, 0.82, 720);
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.text.endsWith("…")).toBe(true);
    expect(wrapped.widestLine + wrapped.padding * 2).toBeLessThanOrEqual(720 * 0.82);
  });

  it("preserves Unicode ellipsis width in the system-sans estimate", () => {
    expect(estimatedTextWidth("…", 64)).toBe(57.6);
    expect(wrapTextForCanvas("A very long title…", 64, 0.3, 1080).text).toContain("…");
  });
});

import { describe, expect, it } from "vitest";
import { estimatedTextWidth, wrapTextForCanvas } from "./TextLayoutModel";
