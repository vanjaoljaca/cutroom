export function selectedCutsFromScenes(scenes: SceneProposal[]): CutProposal[] {
  return scenes.flatMap((scene) => scene.takes.filter((take) => take.selected).map((take) => ({ ...take, id: `${scene.id}-${take.id}`, label: scene.label, order: scene.order, sceneId: scene.id, sceneOrder: scene.order, takeId: take.id, takeOrder: take.order })));
}

import type { CutProposal, SceneProposal } from "./analysis-model";
