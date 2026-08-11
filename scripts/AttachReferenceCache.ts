async function main() {
  const source = await attachCachedRemoteReference({ projectId: required("--project"), url: required("--url"), label: required("--label"), path: required("--path"), transcriptPath: optional("--transcript") });
  console.info(JSON.stringify({ scope: "cutroom-reference-cli", event: "reference_cache_attached", projectId: required("--project"), sourceId: source.id, cachePath: source.cache?.relativePath || "", transcriptPath: source.transcript?.artifactPath || "" }));
}

function required(name: string) {
  const value = optional(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function optional(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "cutroom-reference-cli", event: "reference_cache_attach_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { attachCachedRemoteReference } from "../server/ReferenceMediaCache";
