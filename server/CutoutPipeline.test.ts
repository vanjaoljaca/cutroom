describe("cutout artifact publishing", () => {
  it("preserves persisted status while publishing rendered artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutroom-cutout-"));
    const draft = join(root, "draft");
    const destination = join(root, "cutout");
    await mkdir(draft);
    await mkdir(destination);
    await writeFile(join(destination, "status.json"), "status");
    for (const name of artifactNames) await writeFile(join(draft, name), name);

    await publishCutoutArtifacts(draft, destination);

    expect(await readFile(join(destination, "status.json"), "utf8")).toBe("status");
    for (const name of artifactNames) expect(await readFile(join(destination, name), "utf8")).toBe(name);
    await rm(root, { recursive: true, force: true });
  });
});

const artifactNames = ["preview.webm", "render.mov", "recipe.json"];

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { publishCutoutArtifacts } from "./CutoutPipeline";
