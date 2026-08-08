export type PitchArtifact = {
  schemaVersion: 2;
  projectId: string;
  sourceAudio: string;
  algorithm: "normalized-autocorrelation";
  algorithmVersion: "1.1.0";
  sampleRate: number;
  windowSize: number;
  hopSize: number;
  minHz: number;
  maxHz: number;
  confidenceThreshold: number;
  generatedAt: string;
  points: PitchPoint[];
};

export type PitchPoint = {
  time: number;
  hz: number | null;
  confidence: number;
};

export function nearestNote(hz: number): string {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const octave = Math.floor(midi / 12) - 1;
  return `${noteNames[((midi % 12) + 12) % 12]}${octave}`;
}

const noteNames = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
