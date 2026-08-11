describe("playback diagnostics", () => {
  it("retains a bounded sequence with source and range transitions", () => {
    const log = new PlaybackDiagnosticLog(3);
    log.updateContext(context({ sourceUrl: "a", rangeIndex: 1 }), "1");
    log.record("playing", "2");
    log.updateContext(context({ sourceUrl: "b", rangeIndex: 2 }), "3");
    expect(log.events.map((event) => event.type)).toEqual(["playing", "source-swap", "timeline-boundary"]);
    log.record("waiting", "4");
    log.record("playing", "5");
    expect(log.events.map((event) => event.type)).toEqual(["timeline-boundary", "waiting", "playing"]);
  });

  it("reports presented frame cadence separately from observer cadence", () => {
    const frames = { callbacks: 300, animationCallbacks: 600, total: 600, dropped: 2, firstTotal: 0, firstDropped: 0, firstPresented: 0, lastPresented: 600, firstWallTime: 0, lastWallTime: 10_000, firstAnimationWallTime: 0, lastAnimationWallTime: 10_000, firstMediaTime: 0, lastMediaTime: 10 };
    expect(playbackHealth(frames)).toEqual({ observerHz: 30, compositorHz: 60, presentedFps: 60, droppedFrames: 2 });
  });
});

function context(changes: Partial<ReturnType<typeof baseContext>>) { return { ...baseContext(), ...changes }; }
function baseContext() { return { mode: "cut" as const, sourceUrl: "", sourceTime: 4, programTime: 2, rangeIndex: 0 }; }

import { playbackHealth, PlaybackDiagnosticLog } from "./PlaybackDiagnostics";
