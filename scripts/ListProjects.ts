async function main() {
  const projects = await listProjects();
  console.info(JSON.stringify({ scope: "cutroom-projects", event: "project_list_completed", projects }, null, 2));
}

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "cutroom-projects", event: "project_list_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { listProjects } from "../server/ProjectCatalog";
