describe("recording workspace viewer selection", () => {
  it("switches raw to one assembled project, another project, and raw without mixing timing", () => {
    const raw = rawRecordingViewer(host, 0);
    const direct = projectRecordingViewer(outputs[0], project("direct", [[10, 42], [60, 124]]));
    const demo = projectRecordingViewer(outputs[1], project("demo", [[140, 150], [170, 184]]));
    const rawAgain = rawRecordingViewer(host, 0);
    expect([raw.kind, direct.kind, demo.kind, rawAgain.kind]).toEqual(["raw", "project", "project", "raw"]);
    expect([direct.ranges.length, direct.duration, demo.ranges.length, demo.duration]).toEqual([2, 96, 2, 24]);
    expect([raw.sourceId, rawAgain.sourceId, direct.sourceTime, demo.sourceTime]).toEqual(["media.raw", "media.raw", 10, 140]);
  });

  it("rejects a project that does not match the selected output", () => {
    expect(() => projectRecordingViewer(outputs[0], project("wrong", [[0, 2]]))).toThrow("does not belong");
  });
});

function project(id: string, intervals: Array<[number, number]>): VideoProject {
  return { ...host, id, title: id, programTimeline: { version: 1, clips: intervals.map(([sourceStart, sourceEnd], index) => ({ id: `${id}.${index}`, kind: "source", sourceId: "media.raw", label: `${id} ${index}`, sourceStart, sourceEnd, sceneId: null, takeId: null, createdAt: "2026-08-11T00:00:00.000Z" })) } };
}

const outputs: RecordingPlanOutput[] = [
  { id: "output.direct", projectId: "direct", projectTitle: "Direct", intent: "new", status: "ready", summary: "", sourceRanges: [{ start: 0, end: 15 }] },
  { id: "output.demo", projectId: "demo", projectTitle: "Demo", intent: "new", status: "ready", summary: "", sourceRanges: [{ start: 20, end: 24 }] },
];

const host = {
  id: "host", title: "Host", sourceName: "IMG_9348.MOV", sourcePath: "/Volumes/VanjaOljacaX/Cutroom/raw-videos/IMG_9348.MOV", createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z", revision: 1,
  mediaLibrary: { version: 1, primarySourceId: "media.raw", sources: [{ id: "media.raw", kind: "original", label: "IMG_9348.MOV", path: "/Volumes/VanjaOljacaX/Cutroom/raw-videos/IMG_9348.MOV", remoteUrl: null, cache: null, metadata: { duration: 518, width: 1080, height: 1920, rotation: 0, videoCodec: "hevc", audioCodec: "aac", averageFrameRate: "60/1", nominalFrameRate: "60/1", pixelFormat: "yuv420p", colorSpace: "bt709", colorTransfer: "bt709", colorPrimaries: "bt709", sampleAspectRatio: "1:1", audioSampleRate: 48000 } }] },
  recordingPlan: { version: 1, sourceId: "media.raw", sourceLabel: "IMG_9348.MOV", outputs },
  transcript: { language: "en", duration: 518, source: "fixture", generatedAt: "2026-08-11T00:00:00.000Z", segments: [] }, analysis: { summary: "", directives: [], confidence: 1 }, scenes: [], cuts: [], programTimeline: { version: 1, clips: [] }, editorPreferences: { timelineWindow: "auto" }, assetLibrary: { version: 1, assets: [], bundles: [] }, overlays: [], cutoutOverlays: [], videoOverlays: [], pitchAnalysis: null, exportHistory: [], rawMediaRefs: [],
} as unknown as VideoProject;

import { describe, expect, it } from "vitest";
import type { RecordingPlanOutput, VideoProject } from "./analysis-model";
import { projectRecordingViewer, rawRecordingViewer } from "./RecordingViewerModel";
