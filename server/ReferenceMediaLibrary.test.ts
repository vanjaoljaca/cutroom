describe("project-spanning reference library", () => {
  it("discovers one remote reference across projects and attaches without copying media", async () => {
    const fixture = await createFixture();
    const first = await fixture.store.writeStoredProject(project("first", reference()));
    const second = await fixture.store.writeStoredProject(project("second"));
    const library = await fixture.library.readReferenceMediaLibrary();
    expect(library.records).toMatchObject([{ id: "media.reference.1261519301cd3542", projectIds: ["first"], cacheAvailable: true }]);
    const attached = await fixture.library.attachLibraryReference({ projectId: "second", referenceId: library.records[0].id, revision: second.revision });
    expect(attached.mediaLibrary.sources[1]).toEqual(first.mediaLibrary.sources[1]);
  });

  it("deduplicates the same stable URL and preserves all project provenance", async () => {
    const fixture = await createFixture();
    await fixture.store.writeStoredProject(project("first", reference()));
    await fixture.store.writeStoredProject(project("second", reference()));
    expect((await fixture.library.readReferenceMediaLibrary()).records[0].projectIds.sort()).toEqual(["first", "second"]);
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "cutroom-references-"));
  process.env.CUTROOM_RUNTIME_ROOT = root;
  await mkdir(join(root, "cache/media"), { recursive: true });
  await writeFile(join(root, cachePath), "reference");
  vi.resetModules();
  return { library: await import("./ReferenceMediaLibrary"), store: await import("./project-store") };
}

function project(id: string, savedReference?: VideoMediaSource): VideoProject {
  const value = normalizeVideoProject({ schemaVersion: 1, revision: 0, id, title: id, sourcePath: "/tmp/source.mov", sourceName: "source.mov", createdAt: "2026-08-13T00:00:00.000Z", provider: "fluid-audio", model: "parakeet-tdt-0.6b-v2", transcript: "", words: [], requestSummary: "", scenes: [], cuts: [], artifactsDirectory: "", assetLibrary: { version: 1, assets: [], bundles: [] }, overlays: [], pitchAnalysis: null, exportHistory: [] } as unknown as VideoProject);
  return savedReference ? { ...value, mediaLibrary: { ...value.mediaLibrary, sources: [...value.mediaLibrary.sources, savedReference] } } : value;
}

function reference(): VideoMediaSource {
  return { id: "media.reference.1261519301cd3542", kind: "video", role: "reference", label: "@rockhardpeeps", rawMediaId: null, origin: { type: "remote", url }, cache: { relativePath: cachePath, sha256, bytes: 9, cachedAt: "2026-08-11T00:00:00.000Z" }, transcript: null, metadata: { duration: 52.31, width: 720, height: 1280, averageFps: 30, videoCodec: "h264", audioCodec: "aac", container: "mp4" }, createdAt: "2026-08-11T00:00:00.000Z" };
}

const url = "https://www.tiktok.com/@rockhardpeeps/video/7664055307475127565";
const sha256 = "7ccbff1c4d187a0fff97bbdd0080fae8a1406888692fdd1a3154cb47f72848ed";
const cachePath = `cache/media/${sha256}.mp4`;

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoMediaSource, VideoProject } from "../src/analysis-model";
import { normalizeVideoProject } from "./project-schema";
