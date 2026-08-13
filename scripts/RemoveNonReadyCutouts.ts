async function main() {
  const projectId = requiredArgument("--project");
  const project = await readStoredProject(projectId);
  const removed = project.cutoutOverlays.filter((overlay) => overlay.processing.status !== "ready");
  const ready = project.cutoutOverlays.filter((overlay) => overlay.processing.status === "ready");
  const saved = await writeStoredProject({ ...project, cutoutOverlays: ready });
  console.info(JSON.stringify({ scope: "cutroom-cutout", event: "non_ready_cutouts_removed", projectId, revision: saved.revision, readyCount: ready.length, removed: removed.map(({ id, processing }) => ({ id, status: processing.status })) }));
}

function requiredArgument(name: string) {
  const value = process.argv[process.argv.indexOf(name) + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "cutroom-cutout", event: "non_ready_cutouts_remove_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { readStoredProject, writeStoredProject } from "../server/project-store";
