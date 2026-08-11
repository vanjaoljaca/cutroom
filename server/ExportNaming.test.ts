describe("export file naming", () => {
  it("uses a readable project name, timestamp, and project export version", () => {
    const createdAt = new Date(2026, 7, 8, 11, 21, 15);
    expect(exportFileStem({ projectTitle: "IMG_9340", preset: "tiktok-60", exportVersion: 10, createdAt })).toBe("IMG 9340 - 2026-08-08 11.21.15 - v010 - TikTok Hardware");
    expect(exportFileStem({ projectTitle: "IMG_9340", preset: "tiktok-software", exportVersion: 11, createdAt })).toContain("v011 - TikTok Software");
  });
});

import { exportFileStem } from "./ExportNaming";
