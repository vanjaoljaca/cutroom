export function selectImageBundleCandidate(project: VideoProject, bundleId: string, assetId: string): VideoProject {
  const bundle = project.assetLibrary.bundles.find((item) => item.id === bundleId);
  if (!bundle) throw new Error(`Unknown bundle: ${bundleId}`);
  if (!bundle.candidateAssetIds.includes(assetId)) throw new Error(`Asset is not a candidate in bundle: ${bundleId}/${assetId}`);
  const bundles = project.assetLibrary.bundles.map((item) => item.id === bundleId ? { ...item, selectedAssetId: assetId } : item);
  const overlays = project.overlays.map((overlay) => overlay.bundleId === bundleId ? { ...overlay, assetId } : overlay);
  return { ...project, assetLibrary: { ...project.assetLibrary, bundles }, overlays };
}

import type { VideoProject } from "./analysis-model";
