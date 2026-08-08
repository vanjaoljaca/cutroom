describe("filesystem project catalog", () => {
  it("lists and renames projects without a database", async () => {
    const catalog = await fixtureCatalog();
    const created = await catalog.store.writeStoredProject(fixtureProject("first", "Original"));
    expect(await catalog.module.listProjects()).toMatchObject([{ id: "first", title: "Original", revision: 1 }]);
    const renamed = await catalog.module.renameProject({ projectId: "first", revision: created.revision, title: "Reaction stitch" });
    expect(renamed).toMatchObject({ title: "Reaction stitch", revision: 2 });
  });

  it("moves deleted projects to recoverable Cutroom trash", async () => {
    const catalog = await fixtureCatalog();
    const created = await catalog.store.writeStoredProject(fixtureProject("trash-me", "Temporary"));
    const receipt = await catalog.module.trashProject({ projectId: "trash-me", revision: created.revision });
    expect(receipt.trashPath).toContain("/trash/projects/trash-me-");
    await expect(catalog.store.readStoredProject("trash-me")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function fixtureCatalog() {
  process.env.CUTROOM_RUNTIME_ROOT = await mkdtemp(join(tmpdir(), "cutroom-catalog-"));
  vi.resetModules();
  return { module: await import("./ProjectCatalog"), store: await import("./project-store") };
}

function fixtureProject(id: string, title: string): VideoProject {
  return normalizeVideoProject({ schemaVersion: 1, revision: 0, id, title, sourcePath: "/tmp/source.mov", sourceName: "source.mov", createdAt: "2026-08-08T00:00:00.000Z", provider: "fluid-audio", model: "parakeet-tdt-0.6b-v2", transcript: "", words: [], requestSummary: "", scenes: [], cuts: [], artifactsDirectory: "", assetLibrary: { version: 1, assets: [], bundles: [] }, overlays: [], pitchAnalysis: null, exportHistory: [] } as unknown as VideoProject);
}

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoProject } from "../src/analysis-model";
import { normalizeVideoProject } from "./project-schema";
