describe("pitch graph timeline mapping", () => {
  it("assembles selected ranges without drawing across their transition", () => {
    const points = mapPitchToTimeline(artifact(), "cut", ranges, 20);
    expect(points.map(({ sourceTime, timelineTime, rangeIndex }) => [sourceTime, timelineTime, rangeIndex])).toEqual([[2, 1, 0], [2.5, 1.5, 0], [11, 3, 1], [12, 4, 1]]);
    expect(pitchSegments(points, 1)).toHaveLength(2);
  });

  it("keeps original source time alignment", () => {
    expect(mapPitchToTimeline(artifact(), "original", ranges, 20).map((point) => point.timelineTime)).toEqual([2, 2.5, 5, 11, 12]);
  });

  it("reports honest voiced coverage and useful labeled scale ticks", () => {
    expect(pitchCoverage(artifact(), "cut", ranges, 20)).toMatchObject({ voiced: 4, total: 5, ratio: 0.8 });
    expect(pitchScaleTicks({ minimumMidi: 34, maximumMidi: 73 }).map(({ note }) => note)).toEqual(["C2", "C3", "C4", "C5"]);
    expect(pitchTimeTicks(8)).toEqual([0, 2, 4, 6, 8]);
  });
});

function artifact(): PitchArtifact {
  return { schemaVersion: 2, projectId: "p", sourceAudio: "audio.wav", algorithm: "normalized-autocorrelation", algorithmVersion: "1.1.0", sampleRate: 16000, windowSize: 2048, hopSize: 16000, minHz: 60, maxHz: 500, confidenceThreshold: 0.3, generatedAt: "", points: [{ time: 2, hz: 100, confidence: 0.9 }, { time: 2.5, hz: 105, confidence: 0.9 }, { time: 5, hz: 110, confidence: 0.9 }, { time: 11, hz: 120, confidence: 0.9 }, { time: 12, hz: 130, confidence: 0.9 }, { time: 13, hz: null, confidence: 0.2 }] };
}

const ranges: SourceRange[] = [{ id: "a", order: 1, start: 1, end: 3 }, { id: "b", order: 2, start: 10, end: 13 }];

import type { PitchArtifact } from "./PitchModel";
import { mapPitchToTimeline, pitchCoverage, pitchScaleTicks, pitchSegments, pitchTimeTicks } from "./PitchGraphModel";
import type { SourceRange } from "./editor-model";
