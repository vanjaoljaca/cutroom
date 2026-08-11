describe("workspace raw media library", () => {
  it("deduplicates identical bytes and attaches one stable record to projects", async () => {
    const fixture = await createFixture();
    const first = await fixture.raw.ingestRawMedia(fixture.intakePath);
    const second = await fixture.raw.ingestRawMedia(fixture.intakePath);
    expect(second.id).toBe(first.id);
    await fixture.store.writeStoredProject(fixtureProject("project-one"));
    const attached = await fixture.raw.attachRawMedia({ projectId: "project-one", rawMediaId: first.id, sourceId: "media.primary", role: "creator", primary: true });
    expect(attached.mediaLibrary.sources[0]).toMatchObject({ rawMediaId: first.id, origin: { path: fixture.usbPath } });
    expect((await fixture.raw.readRawMediaLibrary()).records[0].projectIds).toContain("project-one");
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "cutroom-raw-media-"));
  const bytes = Buffer.from("same-video-bytes");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const intakePath = join(root, "intake.mov");
  const usbPath = join(root, "raw-videos", sha256, "intake.mov");
  await mkdir(dirname(usbPath), { recursive: true });
  await writeFile(intakePath, bytes); await writeFile(usbPath, bytes);
  await writeFile(join(root, "raw-videos", "raw-media.json"), JSON.stringify({ version: 1, records: [{ id: `raw.${sha256.slice(0, 16)}`, sha256, originalFilename: "intake.mov", intakePath, usbPath, bytes: bytes.length, ingestedAt: "2026-08-11T00:00:00Z", metadata: { duration: 2, container: "mov", videoCodec: "hevc", width: 1080, height: 1920, frameRate: "60/1", audioCodec: "aac", audioSampleRate: 48000, audioChannels: 2, bitRate: 1000 }, projectIds: [] }] }));
  process.env.CUTROOM_RUNTIME_ROOT = root; vi.resetModules();
  return { root, intakePath, usbPath, raw: await import("./RawMediaLibrary"), store: await import("./project-store") };
}

function fixtureProject(id: string): VideoProject {
  return normalizeVideoProject({ schemaVersion: 1, revision: 0, id, title: id, sourcePath: "/tmp/source.mov", sourceName: "source.mov", createdAt: "2026-08-11T00:00:00Z", provider: "fluid-audio", model: "parakeet-tdt-0.6b-v2", transcript: "", words: [], requestSummary: "", scenes: [], cuts: [], artifactsDirectory: "", assetLibrary: { version: 1, assets: [], bundles: [] }, overlays: [], cutoutOverlays: [], videoOverlays: [], pitchAnalysis: null, exportHistory: [] } as unknown as VideoProject);
}

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { VideoProject } from "../src/analysis-model";
import { normalizeVideoProject } from "./project-schema";
