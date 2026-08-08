export class ProjectSaveQueue {
  private pending: VideoProject | null = null;
  private saving = false;
  private revision = 0;

  constructor(private readonly transport: ProjectSaveTransport, private readonly report: ProjectSaveReporter) {}

  reset(project: VideoProject) {
    this.pending = null;
    this.revision = project.revision;
    this.report({ state: "saved", revision: this.revision, error: null });
  }

  enqueue(project: VideoProject) {
    this.pending = project;
    this.report({ state: "saving", revision: this.revision, error: null });
    if (!this.saving) void this.drain();
  }

  private async drain() {
    this.saving = true;
    try {
      while (this.pending) await this.savePending();
    } catch (error) {
      this.pending = null;
      this.report({ state: "failed", revision: this.revision, error: message(error) });
    } finally {
      this.saving = false;
    }
  }

  private async savePending() {
    const project = this.pending!;
    this.pending = null;
    const saved = await this.transport({ ...project, revision: this.revision });
    this.revision = saved.revision;
    this.report({ state: this.pending ? "saving" : "saved", revision: this.revision, error: null });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type ProjectSaveStatus = { state: "saved" | "saving" | "failed"; revision: number; error: string | null };
type ProjectSaveTransport = (project: VideoProject) => Promise<VideoProject>;
type ProjectSaveReporter = (status: ProjectSaveStatus) => void;

import type { VideoProject } from "./analysis-model";
