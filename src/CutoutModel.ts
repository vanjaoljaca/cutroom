export type CutoutJobState = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type CutoutJobStatus = {
  jobId: string;
  projectId: string;
  overlayId: string;
  state: CutoutJobState;
  progress: number;
  message: string;
  error: string | null;
  project: VideoProject | null;
};

export type CreateCutoutInput = {
  sourceId: string;
  sourceStart: number;
  sourceEnd: number;
  targetClipId: string;
  label: string;
};

import type { VideoProject } from "./analysis-model";
