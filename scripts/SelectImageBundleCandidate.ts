async function main() {
  const projectId = requiredArgument("--project");
  const bundleId = requiredArgument("--bundle");
  const assetId = requiredArgument("--asset");
  const project = await readStoredProject(projectId);
  const selected = selectImageBundleCandidate(project, bundleId, assetId);
  await writeStoredProject(selected);
  console.info(JSON.stringify({ event: "image_bundle_candidate_selected", projectId, bundleId, assetId, overlaysUpdated: selected.overlays.filter((overlay) => overlay.bundleId === bundleId).length }));
}

function requiredArgument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "image_bundle_candidate_select_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { readStoredProject, writeStoredProject } from "../server/project-store";
import { selectImageBundleCandidate } from "../src/ImageBundleModel";
