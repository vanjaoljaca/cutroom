describe("local pitch detector", () => {
  it("finds a voiced 220 Hz tone and leaves silence unvoiced", () => {
    const sampleRate = 16000;
    const tone = Float64Array.from({ length: sampleRate }, (_, index) => index < sampleRate / 2 ? 0 : 0.25 * Math.sin(2 * Math.PI * 220 * index / sampleRate));
    const points = detectPitch(tone, sampleRate);
    const silence = points.filter((point) => point.time < 0.45);
    const voiced = points.filter((point) => point.time > 0.6 && point.hz !== null);
    expect(silence.every((point) => point.hz === null)).toBe(true);
    expect(voiced.length).toBeGreaterThan(10);
    expect(median(voiced.map((point) => point.hz!))).toBeCloseTo(220, 0);
  });
});

function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

import { detectPitch } from "./PitchDetector";
