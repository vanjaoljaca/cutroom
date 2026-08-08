describe("ProjectSaveQueue", () => {
  it("coalesces edits while preserving revision order", async () => {
    const gate = deferred<VideoProject>();
    const transport = vi.fn().mockReturnValueOnce(gate.promise).mockImplementation(async (project: VideoProject) => ({ ...project, revision: 2 }));
    const reports: ProjectSaveStatus[] = [];
    const queue = new ProjectSaveQueue(transport, (status) => reports.push(status));
    queue.reset(project(0, "initial"));
    queue.enqueue(project(0, "first"));
    queue.enqueue(project(0, "latest"));
    gate.resolve(project(1, "first"));
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(transport.mock.calls[1][0]).toMatchObject({ title: "latest", revision: 1 });
    expect(reports.at(-1)).toMatchObject({ state: "saved", revision: 2 });
  });

  it("reports save failures instead of claiming the edit is saved", async () => {
    const reports: ProjectSaveStatus[] = [];
    const queue = new ProjectSaveQueue(async () => { throw new Error("USB unavailable"); }, (status) => reports.push(status));
    queue.reset(project(3, "initial"));
    queue.enqueue(project(3, "changed"));
    await vi.waitFor(() => expect(reports.at(-1)?.state).toBe("failed"));
    expect(reports.at(-1)?.error).toBe("USB unavailable");
  });
});

function project(revision: number, title: string): VideoProject {
  return { revision, title } as VideoProject;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

import type { VideoProject } from "./analysis-model";
import { ProjectSaveQueue, type ProjectSaveStatus } from "./ProjectSaveQueue";
