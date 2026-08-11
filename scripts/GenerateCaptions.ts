async function main() {
  const projectId = required("--project"); const project = await readStoredProject(projectId);
  const saved = await generateSubtitles(projectId, project.revision);
  console.info(JSON.stringify({ scope: "cutroom-subtitles", event: "legacy_caption_command_redirected", projectId, revision: saved.revision, cueCount: saved.subtitleTrack.cues.length }));
}

function required(name: string) { const index = process.argv.indexOf(name); const found = index < 0 ? undefined : process.argv[index + 1]; if (!found) throw new Error(`Missing ${name}`); return found; }

void main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-subtitles", event: "subtitle_generation_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { readStoredProject } from "../server/project-store";
import { generateSubtitles } from "../server/SubtitleService";
