describe("timelineCanvasPercent", () => {
  it("shows the whole timeline in auto mode", () => {
    expect(timelineCanvasPercent(300, "auto")).toBe(100);
  });

  it("uses a fixed visible time window without changing edit duration", () => {
    expect(timelineCanvasPercent(60, "15")).toBe(400);
    expect(timelineCanvasPercent(9, "15")).toBe(60);
  });
});

import { timelineCanvasPercent } from "./TimelineWindowModel";
