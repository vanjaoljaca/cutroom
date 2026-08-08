describe("editor model", () => {
  const ranges: SourceRange[] = [
    { id: "a", order: 1, start: 2, end: 5 },
    { id: "b", order: 2, start: 10, end: 14 },
  ];

  it("maps cut time back into source time", () => {
    expect(sourceTimeFromCutTime(ranges, 4)).toBe(11);
  });

  it("maps source time into the assembled cut", () => {
    expect(cutTimeFromSource(ranges, 1, 12)).toBe(5);
  });

  it("clamps a stale clip index after ripple removal", () => {
    expect(cutTimeFromSource(ranges, 4, 12)).toBe(5);
    expect(cutTimeFromSource([], 4, 12)).toBe(0);
  });

  it("formats player time", () => {
    expect(formatTime(65.9)).toBe("1:05");
  });
});

import { cutTimeFromSource, formatTime, sourceTimeFromCutTime, type SourceRange } from "./editor-model";
