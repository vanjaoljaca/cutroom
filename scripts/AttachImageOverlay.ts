async function main() {
  const projectId = requiredArgument("--project");
  const project = await readStoredProject(projectId);
  const assetId = resolveAssetId(project);
  requireAsset(project, assetId);
  const target = makeTarget(project);
  const overlay = makeOverlay(assetId, target);
  await writeStoredProject({ ...project, overlays: [...project.overlays, overlay] });
  console.info(JSON.stringify({ event: "image_overlay_attached", projectId, overlay }));
}

function resolveAssetId(project: VideoProject) {
  const bundleId = optionalArgument("--bundle");
  if (!bundleId) return requiredArgument("--asset");
  const bundle = project.assetLibrary.bundles.find((item) => item.id === bundleId);
  if (!bundle?.selectedAssetId) throw new Error(`Bundle has no selected candidate: ${bundleId}`);
  return bundle.selectedAssetId;
}

function makeTarget(project: VideoProject): OverlayTarget {
  const cutStart = optionalNumber("--cut-start");
  const cutEnd = optionalNumber("--cut-end");
  if (cutStart !== undefined && cutEnd !== undefined) return { type: "selected-cut", start: cutStart, end: cutEnd };
  const scene = findScene(project, requiredArgument("--scene"));
  const take = findTake(scene, requiredArgument("--take"));
  const start = optionalNumber("--start") || 0;
  const end = optionalNumber("--end") ?? take.end - take.start;
  return { type: "take", sceneId: scene.id, takeId: take.id, start, end };
}

function makeOverlay(assetId: string, target: OverlayTarget): ImageOverlay {
  const placement = (optionalArgument("--placement") || "explicit") as OverlayLayout["placementIntent"];
  const defaults = placementDefaults[placement];
  if (!defaults) throw new Error(`Unsupported placement: ${placement}`);
  return { id: `overlay-${randomUUID()}`, kind: "image", assetId, bundleId: optionalArgument("--bundle") || null, label: optionalArgument("--label") || "Image overlay", target, layout: { anchor: (optionalArgument("--anchor") as OverlayLayout["anchor"]) || defaults.anchor, x: optionalNumber("--x") ?? defaults.x, y: optionalNumber("--y") ?? defaults.y, width: optionalNumber("--width") ?? 0.34, height: optionalNumber("--height") ?? null, fit: "contain", placementIntent: placement }, layer: optionalNumber("--layer") ?? 10, opacity: optionalNumber("--opacity") ?? 1, createdAt: new Date().toISOString() };
}

function findScene(project: VideoProject, value: string): SceneProposal {
  const scene = project.scenes.find((item) => item.id === value || item.order === Number(value));
  if (!scene) throw new Error(`Unknown scene: ${value}`);
  return scene;
}

function findTake(scene: SceneProposal, value: string): TakeProposal {
  const take = scene.takes.find((item) => item.id === value || item.order === Number(value));
  if (!take) throw new Error(`Unknown take in ${scene.id}: ${value}`);
  return take;
}

function requireAsset(project: VideoProject, id: string) {
  if (!project.assetLibrary.assets.some((asset) => asset.id === id)) throw new Error(`Unknown asset: ${id}`);
}

function requiredArgument(name: string): string {
  const value = optionalArgument(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function optionalArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function optionalNumber(name: string): number | undefined {
  const value = optionalArgument(name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${name}: ${value}`);
  return parsed;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "image_overlay_attach_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

const placementDefaults = {
  explicit: { anchor: "top-left", x: 0.05, y: 0.16 },
  "avoid-face-left": { anchor: "top-left", x: 0.04, y: 0.2 },
  "avoid-face-right": { anchor: "top-right", x: 0.96, y: 0.2 },
} satisfies Record<OverlayLayout["placementIntent"], Pick<OverlayLayout, "anchor" | "x" | "y">>;

import { randomUUID } from "node:crypto";
import type { ImageOverlay, OverlayLayout, OverlayTarget, SceneProposal, TakeProposal, VideoProject } from "../src/analysis-model";
import { readStoredProject, writeStoredProject } from "../server/project-store";
