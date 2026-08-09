import { describe, expect, it } from "vitest";

describe("videoPaintSize", () => {
  it("uses display density without exceeding decoded dimensions", () => {
    expect(videoPaintSize(1080, 1920, 170, 303, 2)).toEqual({ width: 340, height: 606 });
    expect(videoPaintSize(1080, 1920, 900, 1600, 2)).toEqual({ width: 1080, height: 1920 });
  });

  it("always returns a drawable surface", () => {
    expect(videoPaintSize(1080, 1920, 0, 0, 2)).toEqual({ width: 1, height: 1 });
  });
});

import { videoPaintSize } from "./VideoPaintSurface";
