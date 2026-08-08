export function detectPitch(samples: Float64Array, sampleRate: number, config = defaultPitchConfig): PitchPoint[] {
  const window = hannWindow(config.windowSize);
  const frame = new Float64Array(config.fftSize);
  const imaginary = new Float64Array(config.fftSize);
  const points: PitchPoint[] = [];
  for (let offset = 0; offset + config.windowSize <= samples.length; offset += config.hopSize) {
    points.push(analyzeFrame(samples, offset, sampleRate, config, window, frame, imaginary));
  }
  return stabilizePitch(points);
}

function analyzeFrame(samples: Float64Array, offset: number, sampleRate: number, config: PitchDetectorConfig, window: Float64Array, real: Float64Array, imaginary: Float64Array): PitchPoint {
  const rms = prepareFrame(samples, offset, config.windowSize, window, real, imaginary);
  const time = (offset + config.windowSize / 2) / sampleRate;
  if (rms < config.minimumRms) return { time, hz: null, confidence: 0 };
  const correlations = normalizedAutocorrelation(real, imaginary, config.windowSize);
  const estimate = estimatePeriod(correlations, sampleRate, config);
  return { time, hz: estimate.confidence >= config.confidenceThreshold ? estimate.hz : null, confidence: estimate.confidence };
}

function prepareFrame(samples: Float64Array, offset: number, size: number, window: Float64Array, real: Float64Array, imaginary: Float64Array): number {
  real.fill(0);
  imaginary.fill(0);
  let energy = 0;
  for (let index = 0; index < size; index += 1) {
    const sample = samples[offset + index];
    energy += sample * sample;
    real[index] = sample * window[index];
  }
  return Math.sqrt(energy / size);
}

function normalizedAutocorrelation(real: Float64Array, imaginary: Float64Array, windowSize: number): Float64Array {
  fft(real, imaginary, false);
  for (let index = 0; index < real.length; index += 1) {
    real[index] = real[index] * real[index] + imaginary[index] * imaginary[index];
    imaginary[index] = 0;
  }
  fft(real, imaginary, true);
  const correlations = new Float64Array(windowSize);
  for (let lag = 0; lag < windowSize; lag += 1) correlations[lag] = real[lag] / Math.max(real[0], Number.EPSILON);
  return correlations;
}

function estimatePeriod(correlations: Float64Array, sampleRate: number, config: PitchDetectorConfig): PitchEstimate {
  const minimumLag = Math.max(2, Math.floor(sampleRate / config.maxHz));
  const maximumLag = Math.min(correlations.length - 2, Math.ceil(sampleRate / config.minHz));
  let lag = strongestPeak(correlations, minimumLag, maximumLag);
  const confidence = lag > 0 ? Math.max(0, Math.min(1, correlations[lag])) : 0;
  if (!lag) return { hz: 0, confidence };
  lag += parabolicOffset(correlations[lag - 1], correlations[lag], correlations[lag + 1]);
  return { hz: sampleRate / lag, confidence };
}

function strongestPeak(values: Float64Array, start: number, end: number): number {
  let best = 0;
  for (let lag = start + 1; lag < end; lag += 1) {
    if (values[lag] > values[lag - 1] && values[lag] >= values[lag + 1] && (!best || values[lag] > values[best])) best = lag;
  }
  return best;
}

function parabolicOffset(left: number, center: number, right: number): number {
  const denominator = left - 2 * center + right;
  return Math.abs(denominator) < Number.EPSILON ? 0 : 0.5 * (left - right) / denominator;
}

function fft(real: Float64Array, imaginary: Float64Array, inverse: boolean) {
  bitReverse(real, imaginary);
  for (let size = 2; size <= real.length; size *= 2) applyFftStage(real, imaginary, size, inverse);
  if (inverse) scaleInverse(real, imaginary);
}

function applyFftStage(real: Float64Array, imaginary: Float64Array, size: number, inverse: boolean) {
  const angle = (inverse ? 2 : -2) * Math.PI / size;
  for (let start = 0; start < real.length; start += size) applyFftBlock(real, imaginary, start, size, angle);
}

function applyFftBlock(real: Float64Array, imaginary: Float64Array, start: number, size: number, angle: number) {
  for (let offset = 0; offset < size / 2; offset += 1) {
    const cosine = Math.cos(angle * offset);
    const sine = Math.sin(angle * offset);
    butterfly(real, imaginary, start + offset, start + offset + size / 2, cosine, sine);
  }
}

function butterfly(real: Float64Array, imaginary: Float64Array, left: number, right: number, cosine: number, sine: number) {
  const nextReal = real[right] * cosine - imaginary[right] * sine;
  const nextImaginary = real[right] * sine + imaginary[right] * cosine;
  real[right] = real[left] - nextReal;
  imaginary[right] = imaginary[left] - nextImaginary;
  real[left] += nextReal;
  imaginary[left] += nextImaginary;
}

function bitReverse(real: Float64Array, imaginary: Float64Array) {
  for (let index = 1, reversed = 0; index < real.length; index += 1) {
    let bit = real.length >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) swap(real, imaginary, index, reversed);
  }
}

function swap(real: Float64Array, imaginary: Float64Array, left: number, right: number) {
  [real[left], real[right]] = [real[right], real[left]];
  [imaginary[left], imaginary[right]] = [imaginary[right], imaginary[left]];
}

function scaleInverse(real: Float64Array, imaginary: Float64Array) {
  for (let index = 0; index < real.length; index += 1) {
    real[index] /= real.length;
    imaginary[index] /= real.length;
  }
}

function hannWindow(size: number): Float64Array {
  return Float64Array.from({ length: size }, (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1)));
}

function stabilizePitch(points: PitchPoint[]): PitchPoint[] {
  return points.map((point, index) => stabilizePoint(points, point, index));
}

function stabilizePoint(points: PitchPoint[], point: PitchPoint, index: number): PitchPoint {
  if (point.hz === null) return point;
  const before = points[index - 1]?.hz;
  const after = points[index + 1]?.hz;
  if (before === null && after === null) return { ...point, hz: null };
  if (!before || !after || Math.max(before, after) / Math.min(before, after) > 1.15) return point;
  const neighbor = (before + after) / 2;
  if (point.hz / neighbor > 1.8) return { ...point, hz: point.hz / 2 };
  if (neighbor / point.hz > 1.8) return { ...point, hz: point.hz * 2 };
  return point;
}

export const defaultPitchConfig: PitchDetectorConfig = { windowSize: 2048, hopSize: 320, fftSize: 4096, minHz: 60, maxHz: 500, minimumRms: 0.008, confidenceThreshold: 0.3 };
export type PitchDetectorConfig = { windowSize: number; hopSize: number; fftSize: number; minHz: number; maxHz: number; minimumRms: number; confidenceThreshold: number };
type PitchEstimate = { hz: number; confidence: number };

import type { PitchPoint } from "../src/PitchModel";
