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
    const startTrimmed = trimProgramClip(moved, reference.id, "start", 1.5);
    const trimmed = trimProgramClip(startTrimmed, reference.id, "end", 2.5);
    expect(trimmed.clips.at(-1)?.sourceStart).toBe(1.5);
    expect(trimmed.clips.at(-1)?.sourceEnd).toBe(2.5);
    expect(removeProgramClip(trimmed, reference.id).clips).toHaveLength(2);
  });

  it("replaces a selected clip while preserving its timeline id", () => {
    const base = createProgramTimeline([scene("opening", 2, 4)], "media.primary", "now");
    const reference = sourceProgramClip({ id: "temporary", sourceId: "media.reference.one", label: "Reference", sourceStart: 0, sourceEnd: 20.9, createdAt: "now" });
    expect(replaceProgramClip(base, "clip.scene.opening", reference).clips[0]).toMatchObject({ id: "clip.scene.opening", kind: "source", sourceId: "media.reference.one", sourceStart: 0, sourceEnd: 20.9 });
  });

  it("splits a segment without mutating scene/take provenance", () => {
    const sceneClip = { ...createProgramTimeline([scene("opening", 10, 14)], "media.primary", "now").clips[0] };
    const split = splitProgramClip({ version: 1, clips: [sceneClip] }, sceneClip.id, 12, "clip.scene.split");
    expect(split.clips.map((clip) => [clip.id, clip.sourceStart, clip.sourceEnd, clip.sceneId, clip.takeId])).toEqual([[sceneClip.id, 10, 12, "opening", "opening-take"], ["clip.scene.split", 12, 14, "opening", "opening-take"]]);
  });

  it("tombstones and restores a segment at its deterministic neighbor position", () => {
    const base = createProgramTimeline([scene("opening", 2, 4), scene("ending", 8, 9)], "media.primary", "now");
    const editorialState = { overlays: [], videoOverlays: [], textOverlays: [] };
    const deleted = deleteProgramClip(base, base.clips[0].id, editorialState, "later");
    expect(deleted.clips.map((clip) => clip.id)).toEqual(["clip.scene.ending"]);
    expect(deleted.deletedClips?.[0]).toMatchObject({ formerIndex: 0, nextClipId: "clip.scene.ending", formerProgramStart: 0, formerProgramEnd: 2, editorialState });
    expect(restoreProgramClip(deleted, base.clips[0].id).clips.map((clip) => clip.id)).toEqual(base.clips.map((clip) => clip.id));
  });
});

function scene(id: string, start: number, end: number): SceneProposal {
  return { id, order: id === "opening" ? 1 : 2, label: id, reason: "", takes: [{ id: `${id}-take`, order: 1, label: "Take 1", reason: "", transcript: "", confidence: 1, start, end, selected: true }] };
}

import { describe, expect, it } from "vitest";
import type { SceneProposal } from "./analysis-model";
import { createProgramTimeline, deleteProgramClip, insertProgramClip, moveProgramClip, removeProgramClip, replaceProgramClip, restoreProgramClip, sourceProgramClip, splitProgramClip, trimProgramClip } from "./ProgramTimelineModel";
