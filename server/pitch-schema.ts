export function validatePitchArtifact(input: PitchArtifact, projectId?: string): PitchArtifact {
  assert(input.schemaVersion === 2, "Unsupported pitch artifact schema.");
  assert(!projectId || input.projectId === projectId, "Pitch artifact project mismatch.");
  assert(input.algorithm === "normalized-autocorrelation" && input.algorithmVersion === "1.1.0", "Unsupported pitch algorithm.");
  assert(input.sampleRate > 0 && input.windowSize > input.hopSize && input.hopSize > 0, "Invalid pitch sampling metadata.");
  assert(input.minHz > 0 && input.maxHz > input.minHz, "Invalid pitch frequency bounds.");
  assert(input.confidenceThreshold >= 0 && input.confidenceThreshold <= 1, "Invalid pitch confidence threshold.");
  input.points.forEach(validatePoint);
  return input;
}

function validatePoint(point: PitchPoint) {
  assert(Number.isFinite(point.time) && point.time >= 0, "Invalid pitch timestamp.");
  assert(point.hz === null || (Number.isFinite(point.hz) && point.hz > 0), "Invalid pitch frequency.");
  assert(Number.isFinite(point.confidence) && point.confidence >= 0 && point.confidence <= 1, "Invalid pitch confidence.");
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

import type { PitchArtifact, PitchPoint } from "../src/PitchModel";
