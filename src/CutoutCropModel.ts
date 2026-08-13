export function normalizedCutoutCrop(crop?: Partial<CutoutCrop> | null): CutoutCrop {
  return { top: crop?.top ?? 0, right: crop?.right ?? 0, bottom: crop?.bottom ?? 0, left: crop?.left ?? 0 };
}

export function validCutoutCrop(crop: CutoutCrop) {
  return edges.every((edge) => Number.isFinite(crop[edge]) && crop[edge] >= 0 && crop[edge] < 1) && remainingWidth(crop) > minimumVisible && remainingHeight(crop) > minimumVisible;
}

export function cropFilter(crop: CutoutCrop) {
  if (edges.every((edge) => crop[edge] === 0)) return "";
  return `crop=trunc(iw*${remainingWidth(crop)}/2)*2:trunc(ih*${remainingHeight(crop)}/2)*2:trunc(iw*${crop.left}/2)*2:trunc(ih*${crop.top}/2)*2,`;
}

export function croppedAspectRatio(sourceWidth: number, sourceHeight: number, crop: CutoutCrop) {
  return (sourceWidth * remainingWidth(crop)) / (sourceHeight * remainingHeight(crop));
}

function remainingWidth(crop: CutoutCrop) { return 1 - crop.left - crop.right; }
function remainingHeight(crop: CutoutCrop) { return 1 - crop.top - crop.bottom; }

const edges = ["top", "right", "bottom", "left"] as const;
const minimumVisible = 0.01;
export type CutoutCrop = { top: number; right: number; bottom: number; left: number };
