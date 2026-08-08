describe("pitch artifact schema", () => {
  it("accepts voiced and unvoiced points", () => {
    expect(validatePitchArtifact(fixture(), "project").points).toHaveLength(2);
  });

  it("rejects invalid confidence and project mismatches", () => {
    const invalid = fixture();
    invalid.points[0].confidence = 2;
    expect(() => validatePitchArtifact(invalid)).toThrow("Invalid pitch confidence");
    expect(() => validatePitchArtifact(fixture(), "another")).toThrow("project mismatch");
  });
});

function fixture(): PitchArtifact {
  return { schemaVersion: 2, projectId: "project", sourceAudio: "jobs/audio.wav", algorithm: "normalized-autocorrelation", algorithmVersion: "1.1.0", sampleRate: 16000, windowSize: 2048, hopSize: 320, minHz: 60, maxHz: 500, confidenceThreshold: 0.3, generatedAt: "", points: [{ time: 0, hz: null, confidence: 0 }, { time: 0.02, hz: 220, confidence: 0.9 }] };
}

import type { PitchArtifact } from "../src/PitchModel";
import { validatePitchArtifact } from "./pitch-schema";
