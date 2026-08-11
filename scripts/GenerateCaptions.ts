async function main() {
  const projectId = required("--project");
  const project = await readStoredProject(projectId);
  const generated = creatorCaptions(project);
  const kept = project.textOverlays.filter((overlay) => overlay.role !== "caption" || overlay.provenance.attribution !== generatedAttribution);
  const saved = await writeStoredProject({ ...project, textOverlays: [...kept, ...generated] });
  console.info(JSON.stringify({ scope: "cutroom-captions", event: "creator_captions_generated", projectId, revision: saved.revision, captionCount: generated.length, excludedReferenceSources: project.mediaLibrary.sources.filter((source) => source.role === "reference").map((source) => source.id) }));
}

function creatorCaptions(project: VideoProject): TextOverlay[] {
  const primaryId = project.mediaLibrary.primarySourceId;
  return project.programTimeline.clips.filter((clip) => clip.sourceId === primaryId).flatMap((clip) => captionGroups(project.words.filter((word) => wordBelongsToClip(word, clip))).map((words) => captionOverlay(primaryId, clip, words)));
}

function wordBelongsToClip(word: WordTiming, clip: ProgramClip) {
  const midpoint = (word.startTime + word.endTime) / 2;
  return midpoint >= clip.sourceStart && midpoint < clip.sourceEnd;
}

function captionGroups(words: WordTiming[]): WordTiming[][] {
  const groups: WordTiming[][] = [];
  words.forEach((word) => { const current = groups.at(-1); if (!current || current.length >= 7 || word.endTime - current[0].startTime > 2.5 || /[.!?]$/.test(current.at(-1)!.word)) groups.push([word]); else current.push(word); });
  return groups;
}

function captionOverlay(sourceId: string, clip: ProgramClip, words: WordTiming[]): TextOverlay {
  return { id: `text.${randomUUID().toLowerCase()}`, kind: "text", role: "caption", text: words.map((word) => word.word).join(" "), target: { type: "program-clip", clipId: clip.id, sourceId, sourceStart: Math.max(clip.sourceStart, words[0].startTime), sourceEnd: Math.min(clip.sourceEnd, words.at(-1)!.endTime + 0.06) }, layout: { anchor: "bottom", x: 0.5, y: 0.82, maxWidth: 0.86, safeZone: true }, style: { fontFamily: "system-sans", fontSize: 58, fontWeight: 700, color: "#ffffff", backgroundColor: "#000000", strokeColor: "#000000", strokeWidth: 2, shadow: true, align: "center" }, layer: 40, opacity: 1, enabled: true, provenance: { sourceId, attribution: generatedAttribution }, createdAt: new Date().toISOString() };
}

function required(name: string) { const index = process.argv.indexOf(name); const found = index < 0 ? undefined : process.argv[index + 1]; if (!found) throw new Error(`Missing ${name}`); return found; }

void main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-captions", event: "caption_generation_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

const generatedAttribution = "cutroom:creator-word-timestamps-v1";

import { randomUUID } from "node:crypto";
import { readStoredProject, writeStoredProject } from "../server/project-store";
import type { ProgramClip, TextOverlay, VideoProject, WordTiming } from "../src/analysis-model";
