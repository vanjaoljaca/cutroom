describe("TikTok Sans preset", () => {
  it("uses TikTok Sans in the browser and the pinned runtime asset for export", () => {
    expect(fontFamily("tiktok-sans")).toBe("'TikTok Sans', sans-serif");
    expect(fontPath("tiktok-sans")).toContain("assets/TikTokSans-Variable.ttf");
  });
});

import { fontPath } from "../server/VideoExportPipeline";
import { fontFamily } from "./TextOverlayEditors";
import { describe, expect, it } from "vitest";
