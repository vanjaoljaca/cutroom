async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = required(args, "project");
  const subjectTrackId = required(args, "subject-track");
  const sourceId = required(args, "source");
  const project = await readStoredProject(projectId);
  const saved = await setSubjectTrackAudio({ projectId, subjectTrackId, sourceId, revision: project.revision, volume: numberArg(args.volume, 1), muted: args.muted === "true" });
  console.log(JSON.stringify({ event: "subject_track_audio_updated", projectId, revision: saved.revision, subjectTrackId, sourceId, clips: saved.programTimeline.clips.filter((clip) => clip.audioSource?.subjectTrackId === subjectTrackId).map((clip) => ({ clipId: clip.id, ...clip.audioSource })) }, null, 2));
}

function parseArgs(values: string[]) { const result: Record<string, string> = {}; for (let index = 0; index < values.length; index += 2) result[values[index].replace(/^--/, "")] = values[index + 1]; return result; }
function required(args: Record<string, string>, key: string) { if (!args[key]) throw new Error(`--${key} is required.`); return args[key]; }
function numberArg(value: string | undefined, fallback: number) { const parsed = value === undefined ? fallback : Number(value); if (!Number.isFinite(parsed)) throw new Error("Volume must be numeric."); return parsed; }

void main().catch((error) => { console.error(JSON.stringify({ event: "subject_track_audio_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { readStoredProject } from "../server/project-store";
import { setSubjectTrackAudio } from "../server/SubjectTrackAudio";
