async function main() {
  const projectId = required("--project"); const operation = process.argv[2]; const project = await readStoredProject(projectId);
  if (operation === "preview") return print(await previewGeneratedSubtitles(projectId));
  if (operation === "generate") return print(await generateSubtitles(projectId, project.revision));
  if (operation === "import") return print(await importSubtitles(projectId, project.revision, JSON.parse(await readFile(required("--file"), "utf8")) as SubtitleCue[]));
  if (operation === "edit") return print(await editSubtitle(projectId, required("--cue"), { revision: project.revision, text: optional("--text"), start: numeric("--start"), end: numeric("--end") }));
  if (operation === "remove") return print(await removeSubtitle(projectId, required("--cue"), project.revision));
  if (operation === "restore") return print(await restoreSubtitle(projectId, required("--cue"), project.revision));
  throw new Error("Use preview, generate, import, edit, remove, or restore.");
}

function print(value: unknown) { console.info(JSON.stringify({ scope: "cutroom-subtitles", event: "subtitle_command_completed", value })); }
function required(name: string) { const value = optional(name); if (!value) throw new Error(`Missing ${name}`); return value; }
function optional(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function numeric(name: string) { const value = optional(name); return value === undefined ? undefined : Number(value); }

void main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-subtitles", event: "subtitle_command_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { readFile } from "node:fs/promises";
import type { SubtitleCue } from "../src/analysis-model";
import { readStoredProject } from "../server/project-store";
import { editSubtitle, generateSubtitles, importSubtitles, previewGeneratedSubtitles, removeSubtitle, restoreSubtitle } from "../server/SubtitleService";
