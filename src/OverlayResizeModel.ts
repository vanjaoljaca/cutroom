export function proportionalOverlaySize(drag: OverlayResizeStart, clientX: number, clientY: number): OverlaySize {
  const deltaX = clientX - drag.clientX;
  const deltaY = clientY - drag.clientY;
  if (!drag.pixelWidth || !drag.pixelHeight) return { width: drag.width, height: drag.height };
  const horizontalScale = deltaX / drag.pixelWidth;
  const verticalScale = deltaY / drag.pixelHeight;
  return scaleOverlaySize(drag, 1 + dominantDelta(horizontalScale, verticalScale));
}

export function scaleOverlaySize(size: OverlaySize, requestedScale: number): OverlaySize {
  const scale = boundedScale(size, requestedScale);
  return { width: size.width * scale, height: size.height === null ? null : size.height * scale };
}

function dominantDelta(horizontal: number, vertical: number) {
  return Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
}

function boundedScale(size: OverlaySize, scale: number) {
  const minimum = Math.max(0.08 / size.width, size.height === null ? 0 : 0.04 / size.height);
  const maximum = Math.min(0.95 / size.width, size.height === null ? Infinity : 0.95 / size.height);
  return Math.min(maximum, Math.max(minimum, scale));
}

export type OverlayResizeStart = { clientX: number; clientY: number; pixelWidth: number; pixelHeight: number; width: number; height: number | null };
export type OverlaySize = { width: number; height: number | null };
