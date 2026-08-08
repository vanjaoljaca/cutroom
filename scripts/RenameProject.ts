async function main() {
  const projectId = requiredArgument("--project");
  const project = await readStoredProject(projectId);
  const renamed = await renameProject({ projectId, revision: project.revision, title: requiredArgument("--title") });
  console.info(JSON.stringify({ scope: "cutroom-projects", event: "project_rename_completed", projectId, title: renamed.title, revision: renamed.revision }));
}

function requiredArgument(name: string) {
  const value = process.argv[process.argv.indexOf(name) + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "cutroom-projects", event: "project_rename_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { renameProject } from "../server/ProjectCatalog";
import { readStoredProject } from "../server/project-store";
