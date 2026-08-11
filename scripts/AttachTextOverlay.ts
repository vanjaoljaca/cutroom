async function main() {
  const projectId = required("--project");
  const project = await readStoredProject(projectId);
  const overlay = makeTextOverlay(project);
  const saved = await writeStoredProject({ ...project, textOverlays: [...project.textOverlays, overlay] });
  console.info(JSON.stringify({ scope: "cutroom-text", event: "text_overlay_attached", projectId, revision: saved.revision, overlay }));
}

function makeTextOverlay(project: VideoProject): TextOverlay {
  const role = value("--role") === "caption" ? "caption" : "title";
  return { id: `text.${randomUUID().toLowerCase()}`, kind: "text", role, text: required("--text"), target: target(project), layout: { anchor: role === "caption" ? "bottom" : "top", x: number("--x", 0.5), y: number("--y", role === "caption" ? 0.82 : 0.08), maxWidth: number("--max-width", 0.86), safeZone: true }, style: { fontFamily: "system-sans", fontSize: number("--font-size", role === "caption" ? 58 : 64), fontWeight: 700, color: "#ffffff", backgroundColor: role === "caption" ? "#000000" : null, strokeColor: "#000000", strokeWidth: 3, shadow: true, align: "center" }, layer: number("--layer", role === "caption" ? 40 : 30), opacity: 1, enabled: true, provenance: { sourceId: value("--source") || null, attribution: value("--attribution") || null }, createdAt: new Date().toISOString() };
}

function target(project: VideoProject): TextOverlay["target"] {
  const clipId = value("--clip");
  if (!clipId) return { type: "selected-cut", start: number("--start", 0), end: number("--end", 3) };
  const clip = project.programTimeline.clips.find((item) => item.id === clipId);
  if (!clip) throw new Error(`Unknown program clip: ${clipId}`);
  return { type: "program-clip", clipId, sourceId: clip.sourceId, sourceStart: number("--source-start", clip.sourceStart), sourceEnd: number("--source-end", clip.sourceEnd) };
}

function required(name: string) { const found = value(name); if (!found) throw new Error(`Missing ${name}`); return found; }
function value(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function number(name: string, fallback: number) { const found = value(name); if (found === undefined) return fallback; const parsed = Number(found); if (!Number.isFinite(parsed)) throw new Error(`Invalid ${name}: ${found}`); return parsed; }

void main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-text", event: "text_overlay_attach_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { randomUUID } from "node:crypto";
import { readStoredProject, writeStoredProject } from "../server/project-store";
import type { TextOverlay, VideoProject } from "../src/analysis-model";
