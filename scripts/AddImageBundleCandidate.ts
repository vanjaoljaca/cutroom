async function main() {
  const projectId = requiredArgument("--project");
  const bundleId = requiredArgument("--bundle");
  const assetId = requiredArgument("--asset");
  const project = await readStoredProject(projectId);
  if (!project.assetLibrary.assets.some((asset) => asset.id === assetId)) throw new Error(`Unknown asset: ${assetId}`);
  const bundle = project.assetLibrary.bundles.find((item) => item.id === bundleId);
  if (!bundle) throw new Error(`Unknown bundle: ${bundleId}`);
  if (!bundle.candidateAssetIds.includes(assetId) && bundle.candidateAssetIds.length >= 5) throw new Error(`Bundle already has five candidates: ${bundleId}`);
  const candidates = bundle.candidateAssetIds.includes(assetId) ? bundle.candidateAssetIds : [...bundle.candidateAssetIds, assetId];
  const bundles = project.assetLibrary.bundles.map((item) => item.id === bundleId ? { ...item, candidateAssetIds: candidates, selectedAssetId: item.selectedAssetId || assetId } : item);
  await writeStoredProject({ ...project, assetLibrary: { ...project.assetLibrary, bundles } });
  console.info(JSON.stringify({ event: "image_bundle_candidate_added", projectId, bundleId, assetId, order: candidates.indexOf(assetId) + 1 }));
}

function requiredArgument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "image_bundle_candidate_add_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { readStoredProject, writeStoredProject } from "../server/project-store";
