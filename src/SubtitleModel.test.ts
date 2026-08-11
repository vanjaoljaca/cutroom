describe("subtitle generation", () => {
  it("maps word timestamps through cuts, jumps, duplicates, and source order", () => {
    const project = fixtureProject();
    const words = { "media.primary": [word("kept", 69.60, 69.67), word("removed", 70, 70.2), word("after", 71.92, 72.1), word("repeat", 78.8, 79)] };
    const cues = generateSubtitleCues(project, words, "2026-08-11T00:00:00.000Z");
    expect(cues.map((cue) => cue.text)).toEqual(["kept", "after", "repeat", "repeat"]);
    expect(cues.map((cue) => cue.provenance.clipId)).toEqual(["clip.first", "clip.after", "clip.result.1", "clip.result.2"]);
    expect(cues[1].target.start).toBeCloseTo(10.8);
    expect(cues[3].target.start).toBeGreaterThan(cues[2].target.start);
  });

  it("splits, tombstones, edits, and restores a cue without touching program clips", () => {
    const cue = generateSubtitleCues(fixtureProject(), { "media.primary": [word("one", 69, 69.2), word("two", 69.3, 69.5)] })[0];
    const track = { ...emptySubtitleTrack(), cues: [cue] }; const split = splitSubtitleCue(track, cue.id, (cue.target.start + cue.target.end) / 2);
    expect(split.cues).toHaveLength(2);
    const deleted = deleteSubtitleCue(split, split.cues[1].id, "2026-08-11T00:00:00.000Z");
    expect(deleted.cues).toHaveLength(1); expect(deleted.deletedCues).toHaveLength(1);
    expect(restoreSubtitleCue(deleted, split.cues[1].id).cues).toHaveLength(2);
  });
});

function fixtureProject(): VideoProject {
  return { mediaLibrary: { primarySourceId: "media.primary" }, programTimeline: { clips: [clip("clip.first", 58.88, 69.68), clip("clip.after", 71.92, 74.64), clip("clip.result.1", 78.72, 80.4), clip("clip.result.2", 78.72, 80.4)] }, words: [], textOverlays: [], subtitleTrack: emptySubtitleTrack() } as unknown as VideoProject;
}

function clip(id: string, sourceStart: number, sourceEnd: number) { return { id, sourceId: "media.primary", sourceStart, sourceEnd } as ProgramClip; }
function word(value: string, startTime: number, endTime: number): WordTiming { return { word: value, startTime, endTime, confidence: 1 }; }

import { describe, expect, it } from "vitest";
import type { ProgramClip, VideoProject, WordTiming } from "./analysis-model";
import { deleteSubtitleCue, emptySubtitleTrack, generateSubtitleCues, restoreSubtitleCue, splitSubtitleCue } from "./SubtitleModel";
