describe("project store revisions", () => {
  it("increments revisions and rejects a stale writer", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutroom-project-store-"));
    process.env.CUTROOM_RUNTIME_ROOT = root;
    vi.resetModules();
    const store = await import("./project-store");
    const first = await store.writeStoredProject(fixtureProject());
    const second = await store.writeStoredProject(first);
    expect([first.revision, second.revision]).toEqual([1, 2]);
    await expect(store.writeStoredProject(first)).rejects.toThrow("Project changed elsewhere");
  });

  it("serializes simultaneous writers so only one stale snapshot lands", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutroom-project-race-"));
    process.env.CUTROOM_RUNTIME_ROOT = root;
    vi.resetModules();
    const store = await import("./project-store");
    const first = await store.writeStoredProject(fixtureProject());
    const results = await Promise.allSettled([store.writeStoredProject(first), store.writeStoredProject(first)]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((await store.readStoredProject("project")).revision).toBe(2);
  });
});

function fixtureProject(): VideoProject {
  return normalizeVideoProject({ schemaVersion: 1, revision: 0, id: "project", title: "Project", sourcePath: "/tmp/source.mov", sourceName: "source.mov", createdAt: "", provider: "fluid-audio", model: "parakeet-tdt-0.6b-v2", transcript: "", words: [], requestSummary: "", scenes: [], cuts: [], artifactsDirectory: "", assetLibrary: { version: 1, assets: [], bundles: [] }, overlays: [], pitchAnalysis: null, exportHistory: [] } as unknown as VideoProject);
}

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoProject } from "../src/analysis-model";
import { normalizeVideoProject } from "./project-schema";
