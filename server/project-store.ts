export async function readStoredProject(id: string): Promise<VideoProject> {
  validateId(id);
  await assertRuntimeStorageAvailable();
  return validateVideoProject(JSON.parse(await readFile(join(projectDirectory(id), "project.json"), "utf8")) as VideoProject);
}

export function writeStoredProject(project: VideoProject): Promise<VideoProject> {
  validateId(project.id);
  const previous = projectWrites.get(project.id) || Promise.resolve();
  const operation = previous.then(() => writeNextRevision(project));
  projectWrites.set(project.id, operation.then(() => undefined, () => undefined));
  return operation;
}

async function writeNextRevision(project: VideoProject): Promise<VideoProject> {
  await assertRuntimeStorageAvailable();
  const directory = projectDirectory(project.id);
  await mkdir(directory, { recursive: true });
  const currentRevision = await storedRevision(project.id);
  if (project.revision !== currentRevision) throw new ProjectRevisionConflict(project.id, project.revision, currentRevision);
  const validated = validateVideoProject({ ...project, revision: currentRevision + 1 });
  const temporary = join(directory, `project-${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`);
  await rename(temporary, join(directory, "project.json"));
  return validated;
}

export class ProjectRevisionConflict extends Error {
  constructor(public readonly projectId: string, public readonly expected: number, public readonly actual: number) {
    super(`Project changed elsewhere (expected revision ${expected}, found ${actual}). Reload before editing again.`);
  }
}

export function projectDirectory(id: string): string {
  validateId(id);
  return join(projectsRoot, id);
}

function validateId(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid project id: ${id}`);
}

async function storedRevision(id: string): Promise<number> {
  try {
    const stored = JSON.parse(await readFile(join(projectDirectory(id), "project.json"), "utf8")) as { revision?: number };
    return stored.revision || 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { VideoProject } from "../src/analysis-model";
import { assertRuntimeStorageAvailable, projectsRoot } from "./RuntimeStorage";
import { validateVideoProject } from "./project-schema";

const projectWrites = new Map<string, Promise<void>>();
