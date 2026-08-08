async function main() {
  const projectId = requiredArgument("--project");
  const project = await readStoredProject(projectId);
  const bundle: ImageAssetBundle = { id: `bundle-${randomUUID()}`, kind: "image-candidates", label: requiredArgument("--label"), source: { sourceUrl: optionalArgument("--source-url") || null, attribution: optionalArgument("--attribution") || null, license: optionalArgument("--license") || null }, candidateAssetIds: [], selectedAssetId: null, createdAt: new Date().toISOString() };
  await writeStoredProject({ ...project, assetLibrary: { ...project.assetLibrary, bundles: [...project.assetLibrary.bundles, bundle] } });
  console.info(JSON.stringify({ event: "image_bundle_created", projectId, bundle }));
}

function requiredArgument(name: string) {
  const value = optionalArgument(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function optionalArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "image_bundle_create_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { randomUUID } from "node:crypto";
import type { ImageAssetBundle } from "../src/analysis-model";
import { readStoredProject, writeStoredProject } from "../server/project-store";
