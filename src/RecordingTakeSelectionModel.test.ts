describe("recording take selection", () => {
  it("counts only takes belonging to scenes in the assembled program", () => {
    expect(countProgramScenesAndTakes(project)).toEqual({ scenes: 2, takes: 4 });
  });

  it("changes the selected take and assembled clip without mutating the input", () => {
    const next = selectProgramTake(project, "clip.one", "take.one.b");
    expect(next.scenes[0].takes.map((take) => take.selected)).toEqual([false, true]);
    expect(next.programTimeline.clips[0]).toMatchObject({ takeId: "take.one.b", sourceStart: 4, sourceEnd: 7 });
    expect(project.programTimeline.clips[0]).toMatchObject({ takeId: "take.one.a", sourceStart: 0, sourceEnd: 3 });
  });

  it("keeps repeated scene clips in program order with deterministic offsets", () => {
    const repeated = { ...project, programTimeline: { ...project.programTimeline, clips: [project.programTimeline.clips[0], project.programTimeline.clips[1], { ...project.programTimeline.clips[0], id: "clip.one.return", sourceStart: 8, sourceEnd: 10 }] } };
    expect(recordingProgramSegments(repeated).map(({ clipId, programStart, programEnd }) => ({ clipId, programStart, programEnd }))).toEqual([
      { clipId: "clip.one", programStart: 0, programEnd: 3 },
      { clipId: "clip.two", programStart: 3, programEnd: 5 },
      { clipId: "clip.one.return", programStart: 5, programEnd: 7 },
    ]);
  });

  it("activates segment playback from Enter or Space without key-repeat", () => {
    expect(recordingSegmentActivationKey("Enter")).toBe(true);
    expect(recordingSegmentActivationKey(" ")).toBe(true);
    expect(recordingSegmentActivationKey(" ", true)).toBe(false);
    expect(recordingSegmentActivationKey("ContextMenu")).toBe(false);
  });
});

const project = {
  scenes: [
    { id: "scene.one", order: 1, label: "One", selectedTakeId: "take.one.a", takes: [{ id: "take.one.a", order: 1, start: 0, end: 3, selected: true }, { id: "take.one.b", order: 2, start: 4, end: 7, selected: false }] },
    { id: "scene.two", order: 2, label: "Two", selectedTakeId: "take.two.a", takes: [{ id: "take.two.a", order: 1, start: 8, end: 10, selected: true }, { id: "take.two.b", order: 2, start: 11, end: 13, selected: false }] },
    { id: "unused", order: 3, label: "Unused", selectedTakeId: "unused.a", takes: [{ id: "unused.a", order: 1, start: 14, end: 15, selected: true }] },
  ],
  programTimeline: { version: 1, clips: [
    { id: "clip.one", kind: "scene", sourceId: "media.primary", label: "One", sourceStart: 0, sourceEnd: 3, sceneId: "scene.one", takeId: "take.one.a", createdAt: "2026-08-11T00:00:00.000Z" },
    { id: "clip.two", kind: "scene", sourceId: "media.primary", label: "Two", sourceStart: 8, sourceEnd: 10, sceneId: "scene.two", takeId: "take.two.a", createdAt: "2026-08-11T00:00:00.000Z" },
  ] },
} as unknown as VideoProject;

import { describe, expect, it } from "vitest";
import type { VideoProject } from "./analysis-model";
import { countProgramScenesAndTakes, recordingProgramSegments, recordingSegmentActivationKey, selectProgramTake } from "./RecordingTakeSelectionModel";
