async function main() {
  const project = await readStoredProject(required("--project"));
  const sourceId = required("--source");
  const source = project.mediaLibrary.sources.find((item) => item.id === sourceId);
  if (!source) throw new Error(`Unknown media source: ${sourceId}`);
  const start = numberArgument("--start");
  const end = numberArgument("--end");
  const replaceId = optional("--replace");
  const clip = sourceProgramClip({ id: replaceId || `clip.source.${randomUUID().toLowerCase()}`, sourceId, label: optional("--label") || source.label, sourceStart: start, sourceEnd: end, createdAt: new Date().toISOString() });
  const timeline = replaceId ? replaceProgramClip(project.programTimeline, replaceId, clip) : insertProgramClip(project.programTimeline, clip, placementIndex(project.programTimeline.clips, optional("--position") || "end"));
  const saved = await writeStoredProject({ ...project, programTimeline: timeline });
  console.info(JSON.stringify({ scope: "cutroom-program-cli", event: replaceId ? "program_source_replaced" : "program_source_added", projectId: saved.id, revision: saved.revision, clipId: clip.id, sourceId, start, end }));
}

function placementIndex(clips: ProgramClip[], placement: string) {
  if (placement === "start") return 0;
  if (placement === "end") return clips.length;
  const [side, clipId] = placement.split(":", 2);
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0 || !["before", "after"].includes(side)) throw new Error(`Invalid program position: ${placement}`);
  return side === "before" ? index : index + 1;
}

function numberArgument(name: string) {
  const value = Number(required(name));
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function required(name: string) { const value = optional(name); if (!value) throw new Error(`Missing ${name}`); return value; }
function optional(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }

void main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-program-cli", event: "program_source_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { randomUUID } from "node:crypto";
import type { ProgramClip } from "../src/analysis-model";
import { insertProgramClip, replaceProgramClip, sourceProgramClip } from "../src/ProgramTimelineModel";
import { readStoredProject, writeStoredProject } from "../server/project-store";
