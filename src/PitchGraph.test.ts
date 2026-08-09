describe("pitch graph labels", () => {
  it("labels the scale with note names without Hz values", () => {
    const graph = createElement(PitchGraph, { artifact, mode: "original", ranges: [], duration: 2, playheadRatio: 0, status: "idle", onSeekRatio: () => undefined });
    const markup = renderToStaticMarkup(graph);
    const axis = markup.match(/class="pitch-y-axis"[^>]*>(.*?)<\/div>/)?.[1] || "";
    expect(axis).toContain("C3");
    expect(axis).not.toContain("Hz");
  });
});

const artifact: PitchArtifact = { schemaVersion: 2, projectId: "p", sourceAudio: "audio.wav", algorithm: "normalized-autocorrelation", algorithmVersion: "1.1.0", sampleRate: 16000, windowSize: 2048, hopSize: 160, minHz: 60, maxHz: 500, confidenceThreshold: 0.3, generatedAt: "", points: [{ time: 0, hz: 130.81, confidence: 0.9 }, { time: 1, hz: 261.63, confidence: 0.9 }] };

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PitchGraph } from "./PitchGraph";
import type { PitchArtifact } from "./PitchModel";
