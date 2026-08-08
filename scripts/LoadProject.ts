async function main() {
  const projectId = requiredArgument("--project");
  const project = await readStoredProject(projectId);
  console.info(JSON.stringify({ scope: "cutroom-projects", event: "project_load_completed", projectId, url: projectWebUrl(projectId), projectPath: join(projectDirectory(projectId), "project.json"), project }, null, 2));
}

function requiredArgument(name: string) {
  const value = process.argv[process.argv.indexOf(name) + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "cutroom-projects", event: "project_load_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { join } from "node:path";
import { projectDirectory, readStoredProject } from "../server/project-store";
import { projectWebUrl } from "../src/ProjectRoute";
