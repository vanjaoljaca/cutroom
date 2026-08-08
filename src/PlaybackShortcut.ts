export function playbackDecision(state: PlaybackState): PlaybackDecision {
  if (!state.paused) return { type: "pause" };
  if (state.mode === "original") return state.currentTime >= state.duration - endTolerance ? replay(0, 0) : { type: "play" };
  const range = state.ranges[state.activeRange];
  if (range && state.currentTime >= range.start && state.currentTime < range.end - endTolerance) return { type: "play" };
  return replay(state.ranges[0]?.start || 0, 0);
}

export function handlePageSpace(event: PageSpaceEvent, togglePlayback: () => void): boolean {
  if (!isPageSpace(event) || event.repeat || excludedTarget(event.target)) return false;
  event.preventDefault();
  togglePlayback();
  return true;
}

function excludedTarget(target: EventTarget | null): boolean {
  const element = target as ShortcutTarget | null;
  if (!element || typeof element.closest !== "function") return false;
  if (element.isContentEditable) return true;
  return Boolean(element.closest("input, textarea, select, button, [contenteditable='true'], [role='button'], [role='checkbox'], [role='radio'], [role='switch']"));
}

function isPageSpace(event: PageSpaceEvent): boolean { return event.key === " " || event.code === "Space"; }
function replay(time: number, rangeIndex: number): PlaybackDecision { return { type: "replay", time, rangeIndex }; }

const endTolerance = 0.04;

export type PlaybackState = { paused: boolean; mode: "cut" | "original"; currentTime: number; duration: number; activeRange: number; ranges: Array<{ start: number; end: number }> };
export type PlaybackDecision = { type: "play" | "pause" } | { type: "replay"; time: number; rangeIndex: number };
export type PageSpaceEvent = Pick<KeyboardEvent, "key" | "code" | "repeat" | "target" | "preventDefault">;
type ShortcutTarget = EventTarget & { isContentEditable?: boolean; closest?: (selector: string) => unknown };
