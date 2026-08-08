describe("take preview loop", () => {
  it("restarts at the take start when playback reaches its end", () => {
    expect(takePreviewRestart(12.97, { start: 8.2, end: 13 })).toBe(8.2);
  });

  it("does not disturb playback inside the take or without a preview", () => {
    expect(takePreviewRestart(12.9, { start: 8.2, end: 13 })).toBeNull();
    expect(takePreviewRestart(30, null)).toBeNull();
  });
});

import { takePreviewRestart } from "./TakePreviewModel";
