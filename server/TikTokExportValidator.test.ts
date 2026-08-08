describe("TikTok export restriction validator", () => {
  it("accepts the explicit Cutroom TikTok preset", () => {
    expect(validateTikTokRestrictions(valid)).toEqual({ valid: true, failures: [] });
  });

  it("rejects a legacy 30 fps or oversized delivery", () => {
    expect(validateTikTokRestrictions({ ...valid, averageFps: 30, bytes: 4_000_000_000 }).failures).toEqual(expect.arrayContaining(["Cutroom TikTok preset must be 60 fps", "file must be under 4 GB"]));
  });
});

const valid = { container: "mov,mp4,m4a,3gp,3g2,mj2", videoCodec: "h264", videoProfile: "High", averageFps: 60, width: 1080, height: 1920, pixelFormat: "yuv420p", colorSpace: "bt709", audioCodec: "aac", audioSampleRate: 48000, audioChannels: 2, bytes: 20_000_000 };

import { validateTikTokRestrictions } from "./TikTokExportValidator";
