async function main() {
  const projectId = requiredArgument("--project");
  const url = requiredArgument("--url");
  const label = requiredArgument("--label");
  const source = await addRemoteReference({ projectId, url, label });
  console.info(JSON.stringify({ event: "reference_media_added", projectId, sourceId: source.id, remoteUrl: url, cachePath: source.cache?.relativePath }));
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "reference_media_add_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { addRemoteReference } from "../server/ReferenceMediaCache";
