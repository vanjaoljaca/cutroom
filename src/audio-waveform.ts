export async function createAudioPeaks(source: string, bucketCount = 180): Promise<number[]> {
  const response = await fetch(source);
  const encoded = await response.arrayBuffer();
  const context = new AudioContext();
  const audio = await context.decodeAudioData(encoded);
  const peaks = samplePeaks(audio.getChannelData(0), bucketCount);
  await context.close();
  return peaks;
}

function samplePeaks(samples: Float32Array, bucketCount: number): number[] {
  const bucketSize = Math.max(1, Math.floor(samples.length / bucketCount));
  return Array.from({ length: bucketCount }, (_, bucket) => {
    let peak = 0;
    const end = Math.min(samples.length, (bucket + 1) * bucketSize);
    for (let index = bucket * bucketSize; index < end; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
    return peak;
  });
}
