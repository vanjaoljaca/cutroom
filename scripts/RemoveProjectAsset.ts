async function main() {
  const projectId = requiredArgument("--project");
  const assetId = requiredArgument("--asset");
  const project = await readStoredProject(projectId);
  const asset = project.assetLibrary.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error(`Unknown asset: ${assetId}`);
  if (project.overlays.some((overlay) => overlay.assetId === assetId)) throw new Error(`Asset is still used by an overlay: ${assetId}`);
  if (project.assetLibrary.bundles.some((bundle) => bundle.candidateAssetIds.includes(assetId))) throw new Error(`Asset is still used by a bundle: ${assetId}`);
  await removeAsset(project, asset);
  console.info(JSON.stringify({ event: "project_asset_removed", projectId, assetId }));
}

async function removeAsset(project: VideoProject, asset: ImageAsset) {
  const path = join(projectDirectory(project.id), asset.relativePath);
  const stagedPath = `${path}.deleting`;
  await rename(path, stagedPath);
  try {
    await writeStoredProject({ ...project, assetLibrary: { ...project.assetLibrary, assets: project.assetLibrary.assets.filter((item) => item.id !== asset.id) } });
    await unlink(stagedPath);
  } catch (error) {
    await rename(stagedPath, path);
    throw error;
  }
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "project_asset_remove_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ImageAsset, VideoProject } from "../src/analysis-model";
import { projectDirectory, readStoredProject, writeStoredProject } from "../server/project-store";
