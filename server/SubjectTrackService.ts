export async function setSubjectTrackCrop(input: SubjectTrackCropInput): Promise<VideoProject> {
  const project = await readStoredProject(input.projectId);
  if (project.revision !== input.revision) throw new ProjectRevisionConflict(project.id, input.revision, project.revision);
  const crop = normalizedCutoutCrop(input.crop);
  const matched = project.cutoutOverlays.filter((overlay) => normalizedSubjectTrackId(overlay) === input.subjectTrackId);
  if (!matched.length) throw new Error(`Unknown subject track: ${input.subjectTrackId}`);
  console.info(JSON.stringify({ scope: "cutroom-subject-track", event: "subject_track_crop_updated", projectId: project.id, subjectTrackId: input.subjectTrackId, segmentCount: matched.length, crop }));
  return writeStoredProject({ ...project, cutoutOverlays: project.cutoutOverlays.map((overlay) => normalizedSubjectTrackId(overlay) === input.subjectTrackId ? { ...overlay, subjectTrackId: input.subjectTrackId, crop } : overlay) });
}

export type SubjectTrackCropInput = { projectId: string; subjectTrackId: string; revision: number; crop: CutoutCrop };

import type { CutoutCrop } from "../src/CutoutCropModel";
import type { VideoProject } from "../src/analysis-model";
import { normalizedCutoutCrop } from "../src/CutoutCropModel";
import { normalizedSubjectTrackId } from "../src/SubjectTrackModel";
import { ProjectRevisionConflict, readStoredProject, writeStoredProject } from "./project-store";
