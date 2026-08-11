import { describe, expect, it } from "vitest";
import { shiftSelectedCutOverlays } from "./ProgramDeleteModel";

describe("program segment deletion", () => {
  it("shifts later selected-cut overlays while preserving source-anchored overlays", () => {
    const project = fixture();
    const shifted = shiftSelectedCutOverlays(project, 20, 3);
    expect(shifted.overlays[0].target).toEqual({ type: "selected-cut", start: 38.6, end: 46.64 });
    expect(shifted.overlays[1].target).toEqual(project.overlays[1].target);
    expect(shifted.textOverlays[0].target).toEqual({ type: "selected-cut", start: 19, end: 20 });
  });
});

function fixture(): any {
  return {
    overlays: [
      { target: { type: "selected-cut", start: 41.6, end: 49.64 } },
      { target: { type: "take", sceneId: "scene", takeId: "take", start: 1, end: 2 } },
    ],
    videoOverlays: [],
    textOverlays: [{ target: { type: "selected-cut", start: 19, end: 21 } }],
  };
}
