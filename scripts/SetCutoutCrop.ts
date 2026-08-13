async function main() {
  const projectId = required("--project");
  const project = await readStoredProject(projectId);
  const allReady = process.argv.includes("--all-ready");
  const overlayId = value("--overlay");
  const bottom = fraction("--bottom");
  const selected = project.cutoutOverlays.filter((overlay) => allReady ? overlay.processing.status === "ready" : overlay.id === overlayId);
  if (!selected.length) throw new Error("No matching subject cutouts.");
  const ids = new Set(selected.map(({ id }) => id));
  const cutoutOverlays = project.cutoutOverlays.map((overlay) => ids.has(overlay.id) ? { ...overlay, crop: { ...overlay.crop, bottom } } : overlay);
  const saved = await writeStoredProject({ ...project, cutoutOverlays });
  console.info(JSON.stringify({ scope: "cutroom-cutout", event: "cutout_crop_updated", projectId, revision: saved.revision, overlayIds: [...ids], crop: { bottom } }));
}

function required(name: string) { const found = value(name); if (!found) throw new Error(`Missing ${name}`); return found; }
function value(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function fraction(name: string) { const found = required(name); const parsed = Number(found); if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 0.99) throw new Error(`Invalid ${name}: ${found}`); return parsed; }

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "cutroom-cutout", event: "cutout_crop_update_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { readStoredProject, writeStoredProject } from "../server/project-store";
