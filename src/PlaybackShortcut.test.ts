describe("page-wide Space playback", () => {
  it("resumes selected-cut playback at the current playhead", () => {
    expect(playbackDecision(state({ currentTime: 12.8 }))).toEqual({ type: "play" });
  });

  it("pauses without seeking when already playing", () => {
    expect(playbackDecision(state({ paused: false, currentTime: 12.8 }))).toEqual({ type: "pause" });
  });

  it("replays only at the selected-cut or original end", () => {
    expect(playbackDecision(state({ currentTime: 14.64 }))).toEqual({ type: "replay", time: 12.12, rangeIndex: 0 });
    expect(playbackDecision(state({ mode: "original", currentTime: 47.99, duration: 48 }))).toEqual({ type: "replay", time: 0, rangeIndex: 0 });
    expect(playbackDecision(state({ mode: "original", currentTime: 21, duration: 48 }))).toEqual({ type: "play" });
  });

  it("prevents scroll and suppresses repeated keydown", () => {
    let toggles = 0;
    let prevented = false;
    expect(handlePageSpace(spaceEvent({ preventDefault: () => { prevented = true; } }), () => { toggles += 1; })).toBe(true);
    expect(handlePageSpace(spaceEvent({ repeat: true }), () => { toggles += 1; })).toBe(false);
    expect({ toggles, prevented }).toEqual({ toggles: 1, prevented: true });
  });

  it("does not hijack editable or native Space-action focus", () => {
    const excluded = ["input", "textarea", "select", "button"].map((tagName) => fakeElement(tagName));
    excluded.forEach((target) => expect(handlePageSpace(spaceEvent({ target }), () => undefined)).toBe(false));
    expect(handlePageSpace(spaceEvent({ target: { isContentEditable: true, closest: () => null } as unknown as EventTarget }), () => undefined)).toBe(false);
    expect(handlePageSpace(spaceEvent({ target: fakeElement("div", "slider") }), () => undefined)).toBe(true);
  });
});

function state(change: Partial<PlaybackState> = {}): PlaybackState {
  return { paused: true, mode: "cut", currentTime: 12.12, duration: 48, activeRange: 0, ranges: [{ start: 12.12, end: 14.64 }], ...change };
}

function spaceEvent(change: Partial<PageSpaceEvent> = {}): PageSpaceEvent {
  return { key: " ", code: "Space", repeat: false, target: null, preventDefault: () => undefined, ...change };
}

function fakeElement(tagName: string, role = ""): EventTarget {
  return { isContentEditable: false, closest: (selector: string) => selector.includes(tagName) || selector.includes(`[role='${role}']`) ? {} : null } as unknown as EventTarget;
}

import { handlePageSpace, playbackDecision, type PageSpaceEvent, type PlaybackState } from "./PlaybackShortcut";
