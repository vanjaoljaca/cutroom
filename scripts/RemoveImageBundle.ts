async function main() {
  const projectId = requiredArgument("--project");
  const bundleId = requiredArgument("--bundle");
  const project = await readStoredProject(projectId);
  if (!project.assetLibrary.bundles.some((bundle) => bundle.id === bundleId)) throw new Error(`Unknown bundle: ${bundleId}`);
  if (project.overlays.some((overlay) => overlay.bundleId === bundleId)) throw new Error(`Bundle is still used by an overlay: ${bundleId}`);
  const bundles = project.assetLibrary.bundles.filter((bundle) => bundle.id !== bundleId);
  await writeStoredProject({ ...project, assetLibrary: { ...project.assetLibrary, bundles } });
  console.info(JSON.stringify({ event: "image_bundle_removed", projectId, bundleId }));
}

function requiredArgument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "image_bundle_remove_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { readStoredProject, writeStoredProject } from "../server/project-store";
