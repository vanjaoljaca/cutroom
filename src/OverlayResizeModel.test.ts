describe("proportional overlay resize", () => {
  it("grows proportionally from horizontal, vertical, or diagonal corner movement", () => {
    for (const size of [sizeAt(100, 0), sizeAt(0, 50), sizeAt(100, 50)]) {
      expect(size.width).toBeCloseTo(0.45);
      expect(size.height).toBeCloseTo(0.3);
    }
  });

  it("keeps auto height automatic and clamps extreme scale", () => {
    expect(proportionalOverlaySize({ ...start, height: null }, 10_000, 10_000)).toEqual({ width: 0.95, height: null });
    expect(proportionalOverlaySize(start, -10_000, -10_000)).toEqual({ width: 0.08, height: 0.05333333333333334 });
  });

  it("scales keyboard resizing proportionally", () => {
    const size = scaleOverlaySize({ width: 0.3, height: 0.2 }, 1 + 0.02 / 0.3);
    expect(size.width).toBeCloseTo(0.32);
    expect(size.height).toBeCloseTo(0.213333);
  });
});

function sizeAt(deltaX: number, deltaY: number) {
  return proportionalOverlaySize(start, start.clientX + deltaX, start.clientY + deltaY);
}

const start = { clientX: 100, clientY: 100, pixelWidth: 200, pixelHeight: 100, width: 0.3, height: 0.2 };

import { proportionalOverlaySize, scaleOverlaySize } from "./OverlayResizeModel";
