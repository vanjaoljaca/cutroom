import { describe, expect, it } from "vitest";

describe("recording plan", () => {
  it("measures disjoint source ranges", () => {
    const output = { sourceRanges: [{ start: 1, end: 3 }, { start: 8, end: 9.5 }] };
    expect(recordingPlanCoverage(output as RecordingPlanOutput)).toBe(3.5);
  });

  it("uses the longest known source boundary", () => {
    const plan = { outputs: [{ sourceRanges: [{ start: 2, end: 12 }] }] };
    expect(recordingPlanDuration(plan as RecordingPlan, 10)).toBe(12);
    expect(recordingPlanDuration(plan as RecordingPlan, 20)).toBe(20);
  });

  it("builds an assembled preview in source-range order", () => {
    const plan = { sourceId: "media.primary" } as RecordingPlan;
    const output = { id: "output.one", projectTitle: "One", sourceRanges: [{ start: 8, end: 9 }, { start: 2, end: 4 }] } as RecordingPlanOutput;
    expect(recordingOutputRanges(plan, output).map((range) => [range.start, range.end])).toEqual([[8, 9], [2, 4]]);
  });

  it("labels reused projects without labeling new ones", () => {
    expect(recordingIntentLabel("existing")).toBe("Existing");
    expect(recordingIntentLabel("new")).toBeNull();
  });
});

import type { RecordingPlan, RecordingPlanOutput } from "./analysis-model";
import { recordingIntentLabel, recordingOutputRanges, recordingPlanCoverage, recordingPlanDuration } from "./RecordingPlanModel";
