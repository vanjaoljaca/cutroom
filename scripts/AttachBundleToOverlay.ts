async function main() {
  const projectId = requiredArgument("--project");
  const overlayId = requiredArgument("--overlay");
  const bundleId = requiredArgument("--bundle");
  const project = await readStoredProject(projectId);
  const bundle = project.assetLibrary.bundles.find((item) => item.id === bundleId);
  if (!bundle?.selectedAssetId) throw new Error(`Bundle has no selected candidate: ${bundleId}`);
  if (!project.overlays.some((overlay) => overlay.id === overlayId)) throw new Error(`Unknown overlay: ${overlayId}`);
  const overlays = project.overlays.map((overlay) => overlay.id === overlayId ? { ...overlay, bundleId, assetId: bundle.selectedAssetId! } : overlay);
  await writeStoredProject({ ...project, overlays });
  console.info(JSON.stringify({ event: "image_bundle_attached_to_overlay", projectId, overlayId, bundleId, assetId: bundle.selectedAssetId }));
}

function requiredArgument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "image_bundle_overlay_attach_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { readStoredProject, writeStoredProject } from "../server/project-store";
