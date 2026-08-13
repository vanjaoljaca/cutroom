import { describe, expect, it } from "vitest";
import { cropFilter, croppedAspectRatio, normalizedCutoutCrop, validCutoutCrop } from "./CutoutCropModel";

describe("cutout crop", () => {
  it("migrates old overlays to a zero crop", () => { expect(normalizedCutoutCrop()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 }); });
  it("rejects crops with no visible area", () => { expect(validCutoutCrop({ top: 0, right: 0.5, bottom: 0, left: 0.5 })).toBe(false); });
  it("crops before scaling and changes visible aspect ratio", () => {
    const crop = { top: 0, right: 0, bottom: 0.2, left: 0 };
    expect(cropFilter(crop)).toContain("crop=trunc(iw*1/2)*2:trunc(ih*0.8/2)*2");
    expect(croppedAspectRatio(1080, 1920, crop)).toBeCloseTo(0.703125);
  });
});
