export type ExportJobState = "queued" | "exporting" | "completed" | "failed" | "cancelled";

export type ExportJobStatus = {
  jobId: string;
  projectId: string;
  preset: ExportPreset;
  state: ExportJobState;
  progress: number;
  message: string;
  receipt: ExportReceipt | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type ExportOverview = {
  currentSnapshotHash: string;
  latest: ExportReceipt | null;
  latestIsCurrent: boolean;
};

import type { ExportPreset, ExportReceipt } from "./analysis-model";
