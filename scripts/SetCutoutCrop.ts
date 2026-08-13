async function main() {
  const projectId = required("--project");
  const project = await readStoredProject(projectId);
  const subjectTrackId = value("--subject-track");
  const allReady = process.argv.includes("--all-ready");
  const overlayId = value("--overlay");
  const crop = process.argv.includes("--reset") ? zeroCrop : cropInput(project, subjectTrackId, overlayId);
  if (subjectTrackId) {
    const saved = await setSubjectTrackCrop({ projectId, subjectTrackId, revision: project.revision, crop });
    return console.info(JSON.stringify({ scope: "cutroom-cutout", event: "subject_track_crop_updated", projectId, revision: saved.revision, subjectTrackId, crop }));
  }
  const selected = project.cutoutOverlays.filter((overlay) => allReady ? overlay.processing.status === "ready" : overlay.id === overlayId);
  if (!selected.length) throw new Error("No matching subject cutouts.");
  const ids = new Set(selected.map(({ id }) => id));
  const cutoutOverlays = project.cutoutOverlays.map((overlay) => ids.has(overlay.id) ? { ...overlay, crop } : overlay);
  const saved = await writeStoredProject({ ...project, cutoutOverlays });
  console.info(JSON.stringify({ scope: "cutroom-cutout", event: "cutout_crop_updated", projectId, revision: saved.revision, overlayIds: [...ids], crop }));
}

function cropInput(project: VideoProject, trackId?: string, overlayId?: string): CutoutCrop {
  const current = project.cutoutOverlays.find((overlay) => overlay.subjectTrackId === trackId || overlay.id === overlayId)?.crop || zeroCrop;
  return normalizedCutoutCrop(Object.fromEntries(cropEdges.map((edge) => [edge, optionalFraction(`--${edge}`) ?? current[edge]])) as unknown as CutoutCrop);
}

function required(name: string) { const found = value(name); if (!found) throw new Error(`Missing ${name}`); return found; }
function value(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function optionalFraction(name: string) { const found = value(name); if (found === undefined) return undefined; const parsed = Number(found); if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 0.99) throw new Error(`Invalid ${name}: ${found}`); return parsed; }

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "cutroom-cutout", event: "cutout_crop_update_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { readStoredProject, writeStoredProject } from "../server/project-store";
import type { CutoutCrop } from "../src/CutoutCropModel";
import type { VideoProject } from "../src/analysis-model";
import { normalizedCutoutCrop } from "../src/CutoutCropModel";
import { setSubjectTrackCrop } from "../server/SubjectTrackService";

const cropEdges = ["top", "right", "bottom", "left"] as const;
const zeroCrop: CutoutCrop = { top: 0, right: 0, bottom: 0, left: 0 };
