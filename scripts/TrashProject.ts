async function main() {
  const projectId = requiredArgument("--project");
  const project = await readStoredProject(projectId);
  const receipt = await trashProject({ projectId, revision: project.revision });
  console.info(JSON.stringify({ scope: "cutroom-projects", event: "project_trash_completed", receipt }));
}

function requiredArgument(name: string) {
  const value = process.argv[process.argv.indexOf(name) + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "cutroom-projects", event: "project_trash_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { trashProject } from "../server/ProjectCatalog";
import { readStoredProject } from "../server/project-store";
