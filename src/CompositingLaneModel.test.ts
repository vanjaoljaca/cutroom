describe("compositing lane order", () => {
  it("places visually higher layers above lower layers while keeping them below Program", () => {
    expect(compositingLaneOrder(9)).toBeLessThan(compositingLaneOrder(2));
    expect(compositingLaneOrder(999)).toBeGreaterThan(0);
  });

  it("bounds extreme persisted layer values", () => {
    expect(compositingLaneOrder(50_000)).toBe(compositingLaneOrder(999));
    expect(compositingLaneOrder(-50_000)).toBe(compositingLaneOrder(-999));
  });
});

import { compositingLaneOrder } from "./CompositingLaneModel";
