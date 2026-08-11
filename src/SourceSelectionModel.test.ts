describe("source selection", () => {
  it("restores the exact selected source clip interval", () => {
    expect(sourceSelection(project, "media.reference", "clip.reference", 52.313)).toEqual({ start: 0, end: 20.9 });
  });

  it("nudges boundaries by source frames without crossing", () => {
    const interval = { start: 0, end: 20.9 };
    expect(nudgeSourceBoundary(interval, "end", -1, 30, 52.313).end).toBeCloseTo(20.866666, 5);
    expect(moveSourceBoundary(interval, "start", 21, 52.313)).toEqual({ start: 20.82, end: 20.9 });
  });

  it("flattens word-timestamp transcript segments", () => {
    const words = transcriptWords({ segments: [{ words: [{ word: " Political", start: 13.42, end: 13.9, probability: 0.98 }] }] });
    expect(words).toEqual([{ text: "Political", start: 13.42, end: 13.9, confidence: 0.98 }]);
  });
});

const project = {
  programTimeline: { clips: [{ id: "clip.reference", sourceId: "media.reference", sourceStart: 0, sourceEnd: 20.9 }] },
} as VideoProject;

import { describe, expect, it } from "vitest";
import type { VideoProject } from "./analysis-model";
import { moveSourceBoundary, nudgeSourceBoundary, sourceSelection, transcriptWords } from "./SourceSelectionModel";
