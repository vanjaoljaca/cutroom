export function timelineCanvasPercent(duration: number, window: TimelineWindow): number {
  if (window === "auto") return 100;
  return Math.max(12, (duration / Number(window)) * 100);
}

import type { TimelineWindow } from "./analysis-model";
