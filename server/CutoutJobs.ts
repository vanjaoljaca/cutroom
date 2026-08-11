export async function startCutoutJob(projectId: string, input: CreateCutoutInput): Promise<CutoutJobStatus> {
  const project = await readStoredProject(projectId);
  const jobId = `cutout-job-${randomUUID().toLowerCase()}`;
  const overlay = makeOverlay(project, input, jobId);
  const saved = await writeStoredProject({ ...project, cutoutOverlays: [...project.cutoutOverlays, overlay] });
  const job = jobStatus(projectId, overlay.id, jobId, saved);
  jobs.set(job.jobId, job);
  await persistJob(job);
  supervisors.set(job.jobId, runJob(job.jobId).finally(() => supervisors.delete(job.jobId)));
  log("cutout_job_started", { projectId, jobId: job.jobId, overlayId: overlay.id });
  return job;
}

export function cutoutJobStatus(projectId: string, jobId: string): CutoutJobStatus {
  const job = jobs.get(jobId);
  if (!job || job.projectId !== projectId) throw new Error(`Unknown cutout job: ${jobId}`);
  return job;
}

export async function durableCutoutJobStatus(projectId: string, jobId: string): Promise<CutoutJobStatus> {
  const active = jobs.get(jobId);
  if (active?.projectId === projectId) return active;
  const project = await readStoredProject(projectId);
  const overlay = project.cutoutOverlays.find((candidate) => candidate.processing.jobId === jobId);
  if (!overlay?.processing.statusPath) throw new Error(`Unknown cutout job: ${jobId}`);
  const stored = JSON.parse(await readFile(join(projectDirectory(projectId), overlay.processing.statusPath), "utf8")) as CutoutJobStatus;
  return stored.state === "processing" || stored.state === "queued" ? { ...stored, state: "failed", message: "Cutout worker was interrupted", error: "The background-removal worker stopped during a server restart. Start the cutout again.", project } : { ...stored, project };
}

async function runJob(jobId: string) {
  const job = jobs.get(jobId)!;
  try {
    await updateAndPersist(jobId, { state: "processing", progress: 0.02, message: "Extracting frames…" });
    const current = await readStoredProject(job.projectId);
    const overlay = current.cutoutOverlays.find((candidate) => candidate.id === job.overlayId)!;
    await updateProjectOverlay(job.projectId, job.overlayId, { status: "processing", phase: "extracting", progress: 0.02 });
    const artifacts = await renderCutoutArtifacts(current, overlay, (progress) => queueProgress(jobId, progress));
    await flushProgress(jobId);
    const completed = await updateProjectOverlay(job.projectId, job.overlayId, { ...artifacts, status: "ready", phase: "ready", progress: 1, error: null });
    await updateAndPersist(jobId, { state: "completed", progress: 1, message: "Cutout ready", project: completed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await updateProjectOverlay(job.projectId, job.overlayId, { status: "failed", error: message }).catch(() => null);
    await updateAndPersist(jobId, { state: "failed", message: "Cutout failed", error: message, project: failed });
    log("cutout_job_failed", { projectId: job.projectId, jobId, error: message });
  }
}

async function updateProjectOverlay(projectId: string, overlayId: string, processing: Partial<CutoutProcessing>) {
  const project = await readStoredProject(projectId);
  const cutoutOverlays = project.cutoutOverlays.map((overlay) => overlay.id === overlayId ? { ...overlay, processing: { ...overlay.processing, ...processing } } : overlay);
  return writeStoredProject({ ...project, cutoutOverlays });
}

function makeOverlay(project: VideoProject, input: CreateCutoutInput, jobId: string): SubjectCutoutOverlay {
  const source = project.mediaLibrary.sources.find((candidate) => candidate.id === input.sourceId);
  const target = project.programTimeline.clips.find((candidate) => candidate.id === input.targetClipId);
  if (!source || !target) throw new Error("Cutout source and target clip are required.");
  const duration = Math.min(input.sourceEnd - input.sourceStart, target.sourceEnd - target.sourceStart);
  if (duration < 0.08) throw new Error("Cutout source and target must overlap for at least 0.08 seconds.");
  const id = `cutout.${randomUUID().toLowerCase()}`;
  const root = `derived/cutouts/${id}`;
  return { id, kind: "subject-cutout", label: input.label.trim() || "Subject cutout", sourceId: source.id, sourceStart: input.sourceStart, sourceEnd: input.sourceStart + duration, target: { type: "program-clip", clipId: target.id, start: 0, end: duration }, layout: { anchor: "top-left", x: 0.62, y: 0.58, width: 0.34, height: null, fit: "contain", placementIntent: "explicit" }, layer: 20, opacity: 1, processing: { provider: "rembg-u2net-human", providerVersion: "1.0.0", status: "queued", previewPath: null, renderPath: null, recipePath: `${root}/recipe.json`, error: null, jobId, phase: "queued", progress: 0, statusPath: `${root}/status.json` }, createdAt: new Date().toISOString() };
}

function jobStatus(projectId: string, overlayId: string, jobId: string, project: VideoProject): CutoutJobStatus {
  return { jobId, projectId, overlayId, state: "queued", progress: 0, message: "Cutout queued", error: null, project };
}

function update(jobId: string, patch: Partial<CutoutJobStatus>) { jobs.set(jobId, { ...jobs.get(jobId)!, ...patch }); }
async function updateAndPersist(jobId: string, patch: Partial<CutoutJobStatus>) { update(jobId, patch); await persistJob(jobs.get(jobId)!); }
function queueProgress(jobId: string, progress: CutoutProgress) { update(jobId, { state: "processing", progress: progress.progress, message: progress.message }); const previous = statusWrites.get(jobId) || Promise.resolve(); statusWrites.set(jobId, previous.then(() => persistJob(jobs.get(jobId)!))); }
async function flushProgress(jobId: string) { await statusWrites.get(jobId); statusWrites.delete(jobId); }
async function persistJob(job: CutoutJobStatus) { const directory = join(projectDirectory(job.projectId), "derived", "cutouts", job.overlayId); await mkdir(directory, { recursive: true }); const path = join(directory, "status.json"); const temporary = `${path}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify({ ...job, project: null }, null, 2)}\n`); await rename(temporary, path); }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-cutout-jobs", event, ...details })); }

const jobs = new Map<string, CutoutJobStatus>();
const supervisors = new Map<string, Promise<void>>();
const statusWrites = new Map<string, Promise<void>>();

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CutoutProcessing, SubjectCutoutOverlay, VideoProject } from "../src/analysis-model";
import type { CreateCutoutInput, CutoutJobStatus } from "../src/CutoutModel";
import { renderCutoutArtifacts, type CutoutProgress } from "./CutoutPipeline";
import { projectDirectory, readStoredProject, writeStoredProject } from "./project-store";
