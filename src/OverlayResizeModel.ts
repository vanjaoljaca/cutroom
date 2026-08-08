export function proportionalOverlaySize(drag: OverlayResizeStart, clientX: number, clientY: number): OverlaySize {
  const deltaX = clientX - drag.clientX;
  const deltaY = clientY - drag.clientY;
  if (!drag.pixelWidth || !drag.pixelHeight) return { width: drag.width, height: drag.height };
  const horizontalScale = deltaX / drag.pixelWidth;
  const verticalScale = deltaY / drag.pixelHeight;
  const scale = boundedScale(drag, 1 + dominantDelta(horizontalScale, verticalScale));
  return { width: drag.width * scale, height: drag.height === null ? null : drag.height * scale };
}

function dominantDelta(horizontal: number, vertical: number) {
  return Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
}

function boundedScale(drag: OverlayResizeStart, scale: number) {
  const minimum = Math.max(0.08 / drag.width, drag.height === null ? 0 : 0.04 / drag.height);
  const maximum = Math.min(0.95 / drag.width, drag.height === null ? Infinity : 0.95 / drag.height);
  return Math.min(maximum, Math.max(minimum, scale));
}

export type OverlayResizeStart = { clientX: number; clientY: number; pixelWidth: number; pixelHeight: number; width: number; height: number | null };
export type OverlaySize = { width: number; height: number | null };
