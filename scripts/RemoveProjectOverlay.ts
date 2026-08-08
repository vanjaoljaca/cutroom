async function main() {
  const projectId = requiredArgument("--project");
  const overlayId = requiredArgument("--overlay");
  const project = await readStoredProject(projectId);
  const overlays = project.overlays.filter((overlay) => overlay.id !== overlayId);
  if (overlays.length === project.overlays.length) throw new Error(`Unknown overlay: ${overlayId}`);
  await writeStoredProject({ ...project, overlays });
  console.info(JSON.stringify({ event: "project_overlay_removed", projectId, overlayId }));
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "project_overlay_remove_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { readStoredProject, writeStoredProject } from "../server/project-store";
