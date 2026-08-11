async function main() {
  const projectId = requiredArgument("--project");
  const inputPath = resolve(requiredArgument("--input"));
  const plan = JSON.parse(await readFile(inputPath, "utf8")) as RecordingPlan;
  const project = await readStoredProject(projectId);
  const saved = await writeStoredProject({ ...project, recordingPlan: plan });
  console.info(JSON.stringify({ event: "recording_plan_saved", projectId, revision: saved.revision, outputCount: plan.outputs.length }));
}

function requiredArgument(name: string) {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "recording_plan_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RecordingPlan } from "../src/analysis-model";
import { readStoredProject, writeStoredProject } from "../server/project-store";
