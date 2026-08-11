export async function previewGeneratedSubtitles(projectId: string): Promise<SubtitleGenerationPreview> {
  const project = await readStoredProject(projectId); const wordsBySource = await transcriptWords(project);
  const cues = generateSubtitleCues(project, wordsBySource);
  log("subtitle_generation_previewed", { projectId, cueCount: cues.length, sourceCount: Object.keys(wordsBySource).length });
  return { projectId, revision: project.revision, cues };
}

export async function generateSubtitles(projectId: string, revision: number): Promise<VideoProject> {
  const project = await expectedProject(projectId, revision); const wordsBySource = await transcriptWords(project);
  const subtitleTrack = { ...project.subtitleTrack, cues: generateSubtitleCues(project, wordsBySource), deletedCues: [] };
  const saved = await writeStoredProject({ ...project, subtitleTrack }); log("subtitles_generated", { projectId, revision: saved.revision, cueCount: subtitleTrack.cues.length }); return saved;
}

export async function importSubtitles(projectId: string, revision: number, cues: SubtitleCue[]): Promise<VideoProject> {
  const project = await expectedProject(projectId, revision); const saved = await writeStoredProject({ ...project, subtitleTrack: { ...project.subtitleTrack, cues } });
  log("subtitles_imported", { projectId, revision: saved.revision, cueCount: cues.length }); return saved;
}

export async function editSubtitle(projectId: string, cueId: string, input: SubtitleEditInput): Promise<VideoProject> {
  const project = await expectedProject(projectId, input.revision); const cue = project.subtitleTrack.cues.find((item) => item.id === cueId); if (!cue) throw new Error(`Unknown subtitle cue: ${cueId}`);
  const next = { ...cue, ...(input.text === undefined ? {} : { text: input.text }), target: { ...cue.target, ...(input.start === undefined ? {} : { start: input.start }), ...(input.end === undefined ? {} : { end: input.end }) } };
  return writeStoredProject({ ...project, subtitleTrack: updateSubtitleCue(project.subtitleTrack, next) });
}

export async function removeSubtitle(projectId: string, cueId: string, revision: number): Promise<VideoProject> { const project = await expectedProject(projectId, revision); return writeStoredProject({ ...project, subtitleTrack: deleteSubtitleCue(project.subtitleTrack, cueId) }); }
export async function restoreSubtitle(projectId: string, cueId: string, revision: number): Promise<VideoProject> { const project = await expectedProject(projectId, revision); return writeStoredProject({ ...project, subtitleTrack: restoreSubtitleCue(project.subtitleTrack, cueId) }); }

async function expectedProject(projectId: string, revision: number) { const project = await readStoredProject(projectId); if (project.revision !== revision) throw new ProjectRevisionConflict(projectId, revision, project.revision); return project; }

async function transcriptWords(project: VideoProject): Promise<Record<string, WordTiming[]>> {
  const words: Record<string, WordTiming[]> = { [project.mediaLibrary.primarySourceId]: project.words || [] };
  for (const source of project.mediaLibrary.sources) { if (!source.transcript || words[source.id]?.length) continue; const artifact = JSON.parse(await readFile(join(runtimeRoot, source.transcript.artifactPath), "utf8")) as TranscriptArtifact; words[source.id] = artifact.wordTimings || artifact.words || []; }
  return words;
}

function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-subtitles", event, ...details })); }

export type SubtitleGenerationPreview = { projectId: string; revision: number; cues: SubtitleCue[] };
export type SubtitleEditInput = { revision: number; text?: string; start?: number; end?: number };
type TranscriptArtifact = { wordTimings?: WordTiming[]; words?: WordTiming[] };

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SubtitleCue, VideoProject, WordTiming } from "../src/analysis-model";
import { deleteSubtitleCue, generateSubtitleCues, restoreSubtitleCue, updateSubtitleCue } from "../src/SubtitleModel";
import { ProjectRevisionConflict, readStoredProject, writeStoredProject } from "./project-store";
import { runtimeRoot } from "./RuntimeStorage";
