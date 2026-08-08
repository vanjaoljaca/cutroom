describe("program timeline", () => {
  it("migrates selected scene takes into ordered clips", () => {
    const timeline = createProgramTimeline([scene("opening", 2, 4), scene("ending", 8, 9)], "media.primary", "now");
    expect(timeline.clips.map((clip) => [clip.id, clip.sourceStart, clip.sourceEnd])).toEqual([["clip.scene.opening", 2, 4], ["clip.scene.ending", 8, 9]]);
  });

  it("inserts, ripples, moves, trims, and removes a reference clip", () => {
    const base = createProgramTimeline([scene("opening", 2, 4), scene("ending", 8, 9)], "media.primary", "now");
    const reference = sourceProgramClip({ id: "clip.source.reference", sourceId: "media.reference.one", label: "Reference", sourceStart: 1, sourceEnd: 3, createdAt: "now" });
    const inserted = insertProgramClip(base, reference, 1);
    expect(inserted.clips.map((clip) => clip.id)).toEqual(["clip.scene.opening", reference.id, "clip.scene.ending"]);
    const moved = moveProgramClip(inserted, reference.id, 1);
    const trimmed = trimProgramClip(moved, reference.id, "end", 2.5);
    expect(trimmed.clips.at(-1)?.sourceEnd).toBe(2.5);
    expect(removeProgramClip(trimmed, reference.id).clips).toHaveLength(2);
  });
});

function scene(id: string, start: number, end: number): SceneProposal {
  return { id, order: id === "opening" ? 1 : 2, label: id, reason: "", takes: [{ id: `${id}-take`, order: 1, label: "Take 1", reason: "", transcript: "", confidence: 1, start, end, selected: true }] };
}

import { describe, expect, it } from "vitest";
import type { SceneProposal } from "./analysis-model";
import { createProgramTimeline, insertProgramClip, moveProgramClip, removeProgramClip, sourceProgramClip, trimProgramClip } from "./ProgramTimelineModel";
