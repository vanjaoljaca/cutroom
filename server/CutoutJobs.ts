export async function startCutoutJob(projectId: string, input: CreateCutoutInput): Promise<CutoutJobStatus> {
  const project = await readStoredProject(projectId);
  const overlay = makeOverlay(project, input);
  const saved = await writeStoredProject({ ...project, cutoutOverlays: [...project.cutoutOverlays, overlay] });
  const job = jobStatus(projectId, overlay.id, saved);
  jobs.set(job.jobId, job);
  supervisors.set(job.jobId, runJob(job.jobId).finally(() => supervisors.delete(job.jobId)));
  log("cutout_job_started", { projectId, jobId: job.jobId, overlayId: overlay.id });
  return job;
}

export function cutoutJobStatus(projectId: string, jobId: string): CutoutJobStatus {
  const job = jobs.get(jobId);
  if (!job || job.projectId !== projectId) throw new Error(`Unknown cutout job: ${jobId}`);
  return job;
}

async function runJob(jobId: string) {
  const job = jobs.get(jobId)!;
  try {
    update(jobId, { state: "processing", progress: 0.04, message: "Removing background…" });
    const current = await readStoredProject(job.projectId);
    update(jobId, { project: current });
    const overlay = current.cutoutOverlays.find((candidate) => candidate.id === job.overlayId)!;
    const artifacts = await renderCutoutArtifacts(current, overlay, (progress) => update(jobId, { progress }));
    const completed = await updateProjectOverlay(job.projectId, job.overlayId, { ...artifacts, status: "ready", error: null });
    update(jobId, { state: "completed", progress: 1, message: "Cutout ready", project: completed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await updateProjectOverlay(job.projectId, job.overlayId, { status: "failed", error: message }).catch(() => null);
    update(jobId, { state: "failed", message: "Cutout failed", error: message, project: failed });
    log("cutout_job_failed", { projectId: job.projectId, jobId, error: message });
  }
}

async function updateProjectOverlay(projectId: string, overlayId: string, processing: Partial<CutoutProcessing>) {
  const project = await readStoredProject(projectId);
  const cutoutOverlays = project.cutoutOverlays.map((overlay) => overlay.id === overlayId ? { ...overlay, processing: { ...overlay.processing, ...processing } } : overlay);
  return writeStoredProject({ ...project, cutoutOverlays });
}

function makeOverlay(project: VideoProject, input: CreateCutoutInput): SubjectCutoutOverlay {
  const source = project.mediaLibrary.sources.find((candidate) => candidate.id === input.sourceId);
  const target = project.programTimeline.clips.find((candidate) => candidate.id === input.targetClipId);
  if (!source || !target) throw new Error("Cutout source and target clip are required.");
  const duration = Math.min(input.sourceEnd - input.sourceStart, target.sourceEnd - target.sourceStart);
  if (duration < 0.08) throw new Error("Cutout source and target must overlap for at least 0.08 seconds.");
  const id = `cutout.${randomUUID().toLowerCase()}`;
  const root = `derived/cutouts/${id}`;
  return { id, kind: "subject-cutout", label: input.label.trim() || "Subject cutout", sourceId: source.id, sourceStart: input.sourceStart, sourceEnd: input.sourceStart + duration, target: { type: "program-clip", clipId: target.id, start: 0, end: duration }, layout: { anchor: "top-left", x: 0.62, y: 0.58, width: 0.34, height: null, fit: "contain", placementIntent: "explicit" }, layer: 20, opacity: 1, processing: { provider: "rembg-u2net-human", providerVersion: "1.0.0", status: "queued", previewPath: null, renderPath: null, recipePath: `${root}/recipe.json`, error: null }, createdAt: new Date().toISOString() };
}

function jobStatus(projectId: string, overlayId: string, project: VideoProject): CutoutJobStatus {
  return { jobId: `cutout-job-${randomUUID().toLowerCase()}`, projectId, overlayId, state: "queued", progress: 0, message: "Cutout queued", error: null, project };
}

function update(jobId: string, patch: Partial<CutoutJobStatus>) { jobs.set(jobId, { ...jobs.get(jobId)!, ...patch }); }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-cutout-jobs", event, ...details })); }

const jobs = new Map<string, CutoutJobStatus>();
const supervisors = new Map<string, Promise<void>>();

import { randomUUID } from "node:crypto";
import type { CutoutProcessing, SubjectCutoutOverlay, VideoProject } from "../src/analysis-model";
import type { CreateCutoutInput, CutoutJobStatus } from "../src/CutoutModel";
import { renderCutoutArtifacts } from "./CutoutPipeline";
import { readStoredProject, writeStoredProject } from "./project-store";
