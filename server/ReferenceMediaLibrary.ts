export async function readReferenceMediaLibrary(): Promise<ReferenceMediaLibrary> {
  log("reference_library_listed", {});
  await assertRuntimeStorageAvailable();
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projects = await Promise.all(entries.filter(isProject).map((entry) => readStoredProject(entry.name)));
  return { version: 1, records: await collectReferences(projects) };
}

export async function attachLibraryReference(input: AttachLibraryReferenceInput): Promise<VideoProject> {
  log("reference_library_attach_requested", { projectId: input.projectId, referenceId: input.referenceId });
  const [project, library] = await Promise.all([readStoredProject(input.projectId), readReferenceMediaLibrary()]);
  if (project.revision !== input.revision) throw new ProjectRevisionConflict(project.id, input.revision, project.revision);
  const record = library.records.find((candidate) => candidate.id === input.referenceId);
  if (!record) throw new Error(`Unknown library reference: ${input.referenceId}`);
  const sources = [...project.mediaLibrary.sources.filter((source) => source.id !== record.source.id), record.source];
  return writeStoredProject({ ...project, mediaLibrary: { ...project.mediaLibrary, sources } });
}

async function collectReferences(projects: VideoProject[]): Promise<ReferenceMediaRecord[]> {
  const records = new Map<string, ReferenceMediaRecord>();
  for (const project of projects) for (const source of project.mediaLibrary.sources.filter(isRemoteReference)) mergeReference(records, project.id, source);
  return Promise.all([...records.values()].map(checkCacheAvailability));
}

function mergeReference(records: Map<string, ReferenceMediaRecord>, projectId: string, source: VideoMediaSource) {
  const id = remoteMediaId(source.origin.type === "remote" ? source.origin.url : "");
  const current = records.get(id);
  if (!current) return void records.set(id, { id, source, projectIds: [projectId], cacheAvailable: false });
  current.projectIds.push(projectId);
  if (!current.source.cache && source.cache) current.source = source;
}

async function checkCacheAvailability(record: ReferenceMediaRecord): Promise<ReferenceMediaRecord> {
  if (!record.source.cache) return record;
  try { await access(join(runtimeRoot, record.source.cache.relativePath)); return { ...record, cacheAvailable: true }; }
  catch { return record; }
}

function isProject(entry: Dirent) { return entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name); }
function isRemoteReference(source: VideoMediaSource) { return source.role === "reference" && source.origin.type === "remote"; }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-reference-library", event, ...details })); }

type AttachLibraryReferenceInput = { projectId: string; referenceId: string; revision: number };

import type { Dirent } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ReferenceMediaLibrary, ReferenceMediaRecord, VideoMediaSource, VideoProject } from "../src/analysis-model";
import { assertRuntimeStorageAvailable, projectsRoot, runtimeRoot } from "./RuntimeStorage";
import { ProjectRevisionConflict, readStoredProject, writeStoredProject } from "./project-store";
import { remoteMediaId } from "./ReferenceMediaCache";
