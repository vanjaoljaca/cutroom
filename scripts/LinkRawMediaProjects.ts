async function main() {
  const rawMediaId = required(parseArgs(process.argv.slice(2)), "raw");
  const record = (await readRawMediaLibrary()).records.find((item) => item.id === rawMediaId);
  if (!record) throw new Error(`Unknown raw media record: ${rawMediaId}`);
  const projects = await Promise.all(record.projectIds.map(readStoredProject));
  const outputs = projects.map((project) => recordingOutput(project, rawMediaId));
  const saved = await Promise.all(projects.map((project) => writeStoredProject({ ...project, recordingPlan: { version: 1, sourceId: sourceIdFor(project, rawMediaId), sourceLabel: record.originalFilename, outputs } })));
  console.info(JSON.stringify({ scope: "cutroom-recording-group-cli", event: "recording_projects_linked", rawMediaId, projects: saved.map((project) => ({ id: project.id, revision: project.revision })) }, null, 2));
}

function recordingOutput(project: VideoProject, rawMediaId: string): RecordingPlanOutput {
  const previous = project.recordingPlan?.outputs.find((output) => output.projectId === project.id);
  const sourceIds = project.mediaLibrary.sources.filter((source) => source.rawMediaId === rawMediaId).map((source) => source.id);
  const sourceRanges = project.programTimeline.clips.filter((clip) => sourceIds.includes(clip.sourceId)).map((clip) => ({ start: clip.sourceStart, end: clip.sourceEnd }));
  return { id: `output.${project.id.replaceAll("-", ".")}`, projectId: project.id, projectTitle: project.title, intent: previous?.intent || "new", status: sourceRanges.length ? "ready" : "planned", summary: previous?.summary || `${project.scenes.length} scenes from this recording`, sourceRanges };
}

function sourceIdFor(project: VideoProject, rawMediaId: string) {
  const source = project.mediaLibrary.sources.find((item) => item.rawMediaId === rawMediaId);
  if (!source) throw new Error(`${project.id} does not reference ${rawMediaId}.`);
  return source.id;
}

function parseArgs(values: string[]) { const result: Record<string, string> = {}; for (let index = 0; index < values.length; index += 2) if (values[index]?.startsWith("--") && values[index + 1]) result[values[index].slice(2)] = values[index + 1]; return result; }
function required(args: Record<string, string>, key: string) { if (!args[key]) throw new Error(`Missing --${key}.`); return args[key]; }

main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-recording-group-cli", event: "recording_projects_link_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import type { RecordingPlanOutput, VideoProject } from "../src/analysis-model";
import { readRawMediaLibrary } from "../server/RawMediaLibrary";
import { readStoredProject, writeStoredProject } from "../server/project-store";
