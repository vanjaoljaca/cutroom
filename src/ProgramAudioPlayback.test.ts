describe("program audio playback", () => {
  it("maps a camera interval onto the current program clip", () => {
    const project = { programTimeline: { clips: [{ id: "clip.one", audioSource: { sourceId: "media.primary", sourceStart: 347.92, sourceEnd: 352.96, volume: 1, muted: false, subjectTrackId: "subject.vanja" } }] } } as VideoProject;
    const active = activeProgramAudio(project, [{ id: "clip.one", clipId: "clip.one", order: 1, start: 62.8, end: 67.84 }], 0, 64.8);
    expect(active).toMatchObject({ sourceId: "media.primary", time: 349.92, volume: 1, muted: false });
  });

  it("returns no replacement audio when the clip has none", () => {
    expect(activeProgramAudio({ programTimeline: { clips: [{ id: "clip.one" }] } } as VideoProject, [{ id: "clip.one", clipId: "clip.one", order: 1, start: 0, end: 1 }], 0, 0)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { VideoProject } from "./analysis-model";
import { activeProgramAudio } from "./ProgramAudioPlayback";
