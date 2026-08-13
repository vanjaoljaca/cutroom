describe("media analysis transcript contract", () => {
  it("replaces a zero provider duration with the probed source duration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cutroom-transcript-"));
    const path = join(directory, "transcript.json");
    await writeFile(path, JSON.stringify({ text: "hello", durationSeconds: 0, wordTimings: [{ word: "hello", startTime: 4, endTime: 5, confidence: 1 }] }));

    const normalized = await normalizeTranscriptDuration(path, JSON.parse(await readFile(path, "utf8")), 12.5);

    expect(normalized.durationSeconds).toBe(12.5);
    expect(JSON.parse(await readFile(path, "utf8")).durationSeconds).toBe(12.5);
  });

  it("rejects an invalid probed source duration", async () => {
    await expect(normalizeTranscriptDuration("/unused", { text: "", durationSeconds: 0, wordTimings: [] }, 0)).rejects.toThrow("Invalid source duration");
  });
});

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeTranscriptDuration } from "./media-analysis";
