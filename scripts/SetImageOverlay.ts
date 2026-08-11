async function main() {
  const projectId = required("--project");
  const overlayId = required("--overlay");
  const project = await readStoredProject(projectId);
  const overlays = project.overlays.map((overlay) => overlay.id === overlayId ? updateOverlay(overlay) : overlay);
  if (overlays.every((overlay, index) => overlay === project.overlays[index])) throw new Error(`Unknown image overlay: ${overlayId}`);
  const saved = await writeStoredProject({ ...project, overlays });
  console.info(JSON.stringify({ scope: "cutroom-image-overlay", event: "image_overlay_updated", projectId, overlayId, revision: saved.revision }));
}

function updateOverlay(overlay: ImageOverlay): ImageOverlay {
  const start = number("--start", overlay.target.start);
  const end = number("--end", overlay.target.end);
  if (overlay.target.type !== "selected-cut") throw new Error("This command currently updates selected-cut image overlays only.");
  return { ...overlay, target: { type: "selected-cut", start, end }, layout: { ...overlay.layout, x: number("--x", overlay.layout.x), y: number("--y", overlay.layout.y), width: number("--width", overlay.layout.width), placementIntent: (value("--placement") as ImageOverlay["layout"]["placementIntent"]) || overlay.layout.placementIntent } };
}

function required(name: string) { const found = value(name); if (!found) throw new Error(`Missing ${name}`); return found; }
function value(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function number(name: string, fallback: number) { const found = value(name); if (found === undefined) return fallback; const parsed = Number(found); if (!Number.isFinite(parsed)) throw new Error(`Invalid ${name}: ${found}`); return parsed; }

void main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-image-overlay", event: "image_overlay_update_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { readStoredProject, writeStoredProject } from "../server/project-store";
import type { ImageOverlay } from "../src/analysis-model";
