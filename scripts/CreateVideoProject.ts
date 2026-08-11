async function main() {
  const sourcePath = resolve(requiredArgument("--source"));
  await access(sourcePath);
  const id = `${slug(basename(sourcePath, extname(sourcePath)))}-${Date.now()}`;
  const analysis = await analyzeSource(sourcePath);
  const project = makeProject(id, sourcePath, optionalArgument("--title"), analysis);
  const directory = projectDirectory(id);
  await writeStoredProject(project);
  console.info(JSON.stringify({ event: "video_project_created", projectId: id, url: projectWebUrl(id), projectPath: join(directory, "project.json") }));
}

function makeProject(id: string, sourcePath: string, requestedTitle: string | null, analysis: AnalysisResult): VideoProject {
  const createdAt = new Date().toISOString();
  const title = requestedTitle ? normalizeProjectTitle(requestedTitle) : displayProjectTitle(basename(sourcePath, extname(sourcePath)));
  const primary = { id: "media.primary", kind: "video" as const, role: "instruction" as const, label: basename(sourcePath), origin: { type: "local" as const, path: sourcePath }, cache: null, metadata: null, createdAt };
  const mediaLibrary = { version: 1 as const, primarySourceId: primary.id, sources: [primary] };
  const sourceRanges = analysis.cuts.map((cut) => ({ start: cut.start, end: cut.end }));
  const recordingPlan = { version: 1 as const, sourceId: primary.id, sourceLabel: primary.label, outputs: [{ id: "output.current", projectId: id, projectTitle: title, intent: "new" as const, status: "ready" as const, summary: "", sourceRanges }] };
  return { ...analysis, schemaVersion: 1, revision: 0, id, title, sourcePath, sourceName: basename(sourcePath), createdAt, recordingPlan, mediaLibrary, programTimeline: createProgramTimeline(analysis.scenes, primary.id, createdAt), editorPreferences: { timelineWindow: "auto" }, assetLibrary: { version: 1, assets: [], bundles: [] }, overlays: [], cutoutOverlays: [], videoOverlays: [], textOverlays: [], pitchAnalysis: null, exportHistory: [] };
}

function optionalArgument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] || null;
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "video_project_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { access } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { AnalysisResult, VideoProject } from "../src/analysis-model";
import { analyzeSource } from "../server/media-analysis";
import { projectDirectory, writeStoredProject } from "../server/project-store";
import { displayProjectTitle, normalizeProjectTitle } from "../src/ProjectTitle";
import { createProgramTimeline } from "../src/ProgramTimelineModel";
import { projectWebUrl } from "../src/ProjectRoute";
