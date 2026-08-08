describe("export file naming", () => {
  it("uses a readable project name, timestamp, and project export version", () => {
    const createdAt = new Date(2026, 7, 8, 11, 21, 15);
    expect(exportFileStem({ projectTitle: "IMG_9340", preset: "tiktok-60", exportVersion: 10, createdAt })).toBe("IMG 9340 - 2026-08-08 11.21.15 - v010 - TikTok");
  });
});

import { exportFileStem } from "./ExportNaming";
