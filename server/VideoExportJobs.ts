export async function startExportJob(projectId: string, preset: ExportPreset = "original-format"): Promise<ExportJobStatus> {
  const running = [...jobs.values()].find((job) => job.status.projectId === projectId && active(job.status.state));
  if (running) return running.status;
  const jobId = `export-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const controller = new AbortController();
  const status: ExportJobStatus = { jobId, projectId, preset, state: "queued", progress: 0, processedSeconds: 0, totalSeconds: 0, etaSeconds: null, message: preset === "original-format" ? "Planning source-preserving export…" : "Preparing TikTok export…", receipt: null, error: null, startedAt: new Date().toISOString(), finishedAt: null };
  const job = { status, controller };
  jobs.set(jobId, job);
  void runExportJob(job);
  return status;
}

export function exportJobStatus(projectId: string, jobId: string): ExportJobStatus {
  const job = jobs.get(jobId);
  if (!job || job.status.projectId !== projectId) throw new Error(`Unknown export job: ${jobId}`);
  return job.status;
}

export function cancelExportJob(projectId: string, jobId: string): ExportJobStatus {
  const job = jobs.get(jobId);
  if (!job || job.status.projectId !== projectId) throw new Error(`Unknown export job: ${jobId}`);
  if (active(job.status.state)) job.controller.abort();
  return job.status;
}

export async function exportOverview(projectId: string): Promise<ExportOverview> {
  const project = await readStoredProject(projectId);
  const latest = project.exportHistory.at(-1) || null;
  const currentSnapshotHash = projectSnapshotHash(project);
  return { currentSnapshotHash, latest, latestIsCurrent: Boolean(latest && latest.projectSnapshotHash === currentSnapshotHash) };
}

async function runExportJob(job: ExportJob) {
  update(job, { state: "exporting", message: "Rendering selected cut…", progress: 0.01 });
  try {
    const receipt = await renderProjectVideo(job.status.projectId, { jobId: job.status.jobId, preset: job.status.preset, signal: job.controller.signal, onProgress: (detail) => update(job, { ...detail, message: progressMessage(detail) }) });
    update(job, { state: "completed", progress: 1, message: `Exported ${basename(receipt.outputPath)}`, receipt, finishedAt: new Date().toISOString() });
  } catch (error) {
    const cancelled = job.controller.signal.aborted;
    update(job, { state: cancelled ? "cancelled" : "failed", message: cancelled ? "Export cancelled." : "Export failed.", error: message(error), finishedAt: new Date().toISOString() });
  }
}

function update(job: ExportJob, change: Partial<ExportJobStatus>) {
  job.status = { ...job.status, ...change };
  jobs.set(job.status.jobId, job);
  log("export_job_updated", { jobId: job.status.jobId, projectId: job.status.projectId, state: job.status.state, progress: job.status.progress });
}

function active(state: ExportJobState): boolean { return state === "queued" || state === "exporting"; }
function progressMessage(detail: ExportProgress) { const eta = detail.etaSeconds === null ? "estimating…" : `${formatDuration(detail.etaSeconds)} left`; return `Rendering ${formatDuration(detail.processedSeconds)} / ${formatDuration(detail.totalSeconds)} · ${eta}`; }
function formatDuration(seconds: number) { const rounded = Math.max(0, Math.round(seconds)); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-export-jobs", event, ...details })); }

type ExportJob = { status: ExportJobStatus; controller: AbortController };
const jobs = new Map<string, ExportJob>();

import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { ExportPreset } from "../src/analysis-model";
import type { ExportJobState, ExportJobStatus, ExportOverview } from "../src/ExportModel";
import { readStoredProject } from "./project-store";
import { projectSnapshotHash, renderProjectVideo, type ExportProgress } from "./VideoExportPipeline";
