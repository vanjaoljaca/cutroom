async function main() {
  const projectId = requiredArgument("--project");
  const sourceId = requiredArgument("--source");
  const receipt = await removeRemoteReference(projectId, sourceId);
  console.info(JSON.stringify({ event: "reference_media_removed", ...receipt }));
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "reference_media_remove_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { removeRemoteReference } from "../server/ReferenceMediaCache";
