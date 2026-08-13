describe("logical subject tracks", () => {
  it("groups discontinuous source artifacts into one contiguous program lane", () => {
    const segments = groupedSubjectIntervals(cutoutProgramIntervals(project, programRanges(project))).get("subject.vanja")!;
    expect(segments.map(({ start, end }) => [rounded(start), rounded(end)])).toEqual([[0, 5.04], [5.04, 17.12], [17.12, 30.16], [30.16, 37.6]]);
    expect(segments.map(({ overlay }) => overlay.sourceStart)).toEqual([347.92, 382, 412.56, 430.24]);
    expect(subjectTrackLabel(segments.map(({ overlay }) => overlay))).toBe("Vanja");
  });

  it("derives one stable legacy id from numbered artifact labels", () => {
    expect(normalizedSubjectTrackId(overlay("clip.finish", 430.24, 437.68, "Vanja keyed over ReadJapanese — 8"))).toBe("subject.vanja");
  });
});

const clips = [clip("clip.attempt-one", 5.04), clip("clip.attempt-two", 12.08), clip("clip.attempt-three", 13.04), clip("clip.finish", 7.44)];
const overlays = [overlay("clip.attempt-one", 347.92, 352.96, "Vanja keyed over ReadJapanese — 3"), overlay("clip.attempt-two", 382, 394.08, "Vanja keyed over ReadJapanese — 6"), overlay("clip.attempt-three", 412.56, 425.6, "Vanja keyed over ReadJapanese — 7"), overlay("clip.finish", 430.24, 437.68, "Vanja keyed over ReadJapanese — 8")];
const project = { programTimeline: { clips }, cutoutOverlays: overlays } as unknown as VideoProject;

function clip(id: string, duration: number) { return { id, sourceStart: 0, sourceEnd: duration, order: 0 }; }
function rounded(value: number) { return Math.round(value * 100) / 100; }
function overlay(clipId: string, sourceStart: number, sourceEnd: number, label: string): SubjectCutoutOverlay { return { id: `cutout.${clipId}`, kind: "subject-cutout", label, sourceId: "media.primary", sourceStart, sourceEnd, target: { type: "program-clip", clipId, start: 0, end: sourceEnd - sourceStart }, layout: { anchor: "top-left", x: .62, y: .58, width: .34, height: null, fit: "contain", placementIntent: "explicit" }, crop: { top: 0, right: 0, bottom: .2, left: 0 }, layer: 20, opacity: 1, processing: { provider: "rembg-u2net-human-coreml", providerVersion: "2.0.0", status: "ready", previewPath: "preview.webm", renderPath: "render.mov", recipePath: "recipe.json", error: null }, createdAt: "" }; }

import { describe, expect, it } from "vitest";
import type { SubjectCutoutOverlay, VideoProject } from "./analysis-model";
import { cutoutProgramIntervals } from "./CutoutOverlayModel";
import { programRanges } from "./ProgramTimelineModel";
import { groupedSubjectIntervals, normalizedSubjectTrackId, subjectTrackLabel } from "./SubjectTrackModel";
