describe("timeline trim preview", () => {
  it("shrinks only the active clip before the trim is committed", () => {
    const ranges = [range("one", 0, 3), range("two", 3, 6), range("three", 6, 9)];
    const positions = timelineTrimPositions(ranges, { rangeId: "two", edge: "end", value: 5 });
    expect(positions.map(({ left, width, shortened }) => [rounded(left), rounded(width), shortened])).toEqual([
      [0, 33.3333, 0], [33.3333, 22.2222, 1], [66.6667, 33.3333, 0],
    ]);
  });

  it("previews a shortened clip start without rippling its neighbors", () => {
    const ranges = [range("one", 0, 3), range("two", 3, 6), range("three", 6, 9)];
    const positions = timelineTrimPositions(ranges, { rangeId: "two", edge: "start", value: 4 });
    expect(positions.map(({ left, width, shortened }) => [rounded(left), rounded(width), shortened])).toEqual([
      [0, 33.3333, 0], [44.4444, 22.2222, 1], [66.6667, 33.3333, 0],
    ]);
  });
});

function range(id: string, start: number, end: number): SourceRange {
  return { id, order: 1, start, end };
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

import type { SourceRange } from "./editor-model";
import { timelineTrimPositions } from "./TimelineTrimPreviewModel";
