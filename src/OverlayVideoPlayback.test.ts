describe("overlay video playback", () => {
  it("pauses inactive media without seeking its decoder", () => {
    expect(overlayPlaybackDecision({ active: false, playing: true, time: 48, currentTime: 2 })).toEqual({ seek: null, play: false });
  });

  it("seeks only active media and follows main playback", () => {
    expect(overlayPlaybackDecision({ active: true, playing: true, time: 48, currentTime: 2 })).toEqual({ seek: 48, play: true });
    expect(overlayPlaybackDecision({ active: true, playing: false, time: 48, currentTime: 47.94 })).toEqual({ seek: null, play: false });
  });
});

import { overlayPlaybackDecision } from "./OverlayVideoPlayback";
