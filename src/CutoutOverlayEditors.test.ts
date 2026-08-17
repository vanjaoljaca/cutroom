describe("cutout overlay loading", () => {
  it("loads only the active and upcoming alpha segments", () => {
    const intervals = [interval("one", 0, 5), interval("two", 5, 10), interval("three", 10, 15)];
    expect(loadedCutoutIntervals(intervals, "cut", 2, null).map((item) => item.overlay.id)).toEqual(["one", "two"]);
    expect(loadedCutoutIntervals(intervals, "cut", 7, null).map((item) => item.overlay.id)).toEqual(["two", "three"]);
  });

  it("loads no cutout decoders in original mode", () => expect(loadedCutoutIntervals([interval("one", 0, 5)], "original", 2, null)).toEqual([]));
});

function interval(id: string, start: number, end: number) { return { start, end, overlay: { id } } as CutoutProgramInterval; }

import { describe, expect, it } from "vitest";
import { loadedCutoutIntervals } from "./CutoutOverlayEditors";
import type { CutoutProgramInterval } from "./CutoutOverlayModel";
