async function main() {
  const projectId = requiredArgument("--project");
  const sourceId = requiredArgument("--source");
  const source = await regenerateRemoteReference(projectId, sourceId);
  console.info(JSON.stringify({ event: "reference_media_regenerated", projectId, sourceId, cachePath: source.cache?.relativePath }));
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "reference_media_regeneration_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { regenerateRemoteReference } from "../server/ReferenceMediaCache";
