export async function setSubjectTrackAudio(input: SetSubjectTrackAudioInput): Promise<VideoProject> {
  const project = await readStoredProject(input.projectId);
  if (project.revision !== input.revision) throw new ProjectRevisionConflict(input.projectId, input.revision, project.revision);
  const overlays = project.cutoutOverlays.filter((overlay) => overlay.subjectTrackId === input.subjectTrackId && overlay.processing.status === "ready");
  if (!overlays.length) throw new Error(`Unknown ready subject track: ${input.subjectTrackId}`);
  const clips = project.programTimeline.clips.map((clip) => withTrackAudio(clip, overlays, input));
  const saved = await writeStoredProject({ ...project, programTimeline: { ...project.programTimeline, clips } });
  log("subject_track_audio_saved", { projectId: input.projectId, subjectTrackId: input.subjectTrackId, sourceId: input.sourceId, clips: overlays.length, volume: input.volume, muted: input.muted });
  return saved;
}

function withTrackAudio(clip: ProgramClip, overlays: SubjectCutoutOverlay[], input: SetSubjectTrackAudioInput): ProgramClip {
  const overlay = overlays.find((candidate) => candidate.target.clipId === clip.id);
  if (!overlay) return clip;
  const duration = clip.sourceEnd - clip.sourceStart;
  if (overlay.sourceEnd - overlay.sourceStart + 0.01 < duration) throw new Error(`Subject audio is shorter than program clip: ${clip.id}`);
  return { ...clip, audioSource: { sourceId: input.sourceId, sourceStart: overlay.sourceStart, sourceEnd: overlay.sourceStart + duration, volume: input.volume, muted: input.muted, subjectTrackId: input.subjectTrackId } };
}

function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "subject-track-audio", event, ...details })); }

export type SetSubjectTrackAudioInput = { projectId: string; subjectTrackId: string; revision: number; sourceId: string; volume: number; muted: boolean };

import type { ProgramClip, SubjectCutoutOverlay, VideoProject } from "../src/analysis-model";
import { ProjectRevisionConflict, readStoredProject, writeStoredProject } from "./project-store";
