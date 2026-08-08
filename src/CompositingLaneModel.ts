export function compositingLaneOrder(layer: number): number {
  return laneOrderBase - Math.max(minimumLayer, Math.min(maximumLayer, layer));
}

const laneOrderBase = 1_000;
const minimumLayer = -999;
const maximumLayer = 999;
