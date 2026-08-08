describe("reference media identity", () => {
  it("creates a stable URL-owned media id", () => {
    expect(remoteMediaId("https://example.com/video.mov")).toBe(remoteMediaId("https://example.com/video.mov"));
    expect(remoteMediaId("https://example.com/other.mov")).not.toBe(remoteMediaId("https://example.com/video.mov"));
  });

  it("explains how to recover a missing disposable cache", () => {
    const source = { id: "media.reference.1234", origin: { type: "remote", url: "https://example.com/video.mov" }, cache: null } as VideoMediaSource;
    expect(() => mediaSourcePath(source)).toThrow("Regenerate it from https://example.com/video.mov");
  });
});

import type { VideoMediaSource } from "../src/analysis-model";
import { mediaSourcePath, remoteMediaId } from "./ReferenceMediaCache";
