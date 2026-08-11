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
});

function context(changes: Partial<ReturnType<typeof baseContext>>) { return { ...baseContext(), ...changes }; }
function baseContext() { return { mode: "cut" as const, sourceUrl: "", sourceTime: 4, programTime: 2, rangeIndex: 0 }; }

import { PlaybackDiagnosticLog } from "./PlaybackDiagnostics";
