export async function listProjects(): Promise<ProjectSummary[]> {
  log("project_catalog_listed", {});
  await mkdir(projectsRoot, { recursive: true });
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projects = await Promise.all(entries.filter(isProjectDirectory).map((entry) => summarizeProject(entry.name)));
  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function renameProject(input: RenameProjectInput): Promise<VideoProject> {
  log("project_rename_requested", { projectId: input.projectId });
  const project = await readStoredProject(input.projectId);
  assertRevision(project, input.revision);
  const title = normalizeProjectTitle(input.title);
  const recordingPlan = recordingPlanForProject(project);
  const outputs = recordingPlan.outputs.map((output) => output.projectId === project.id ? { ...output, projectTitle: title } : output);
  return writeStoredProject({ ...project, title, recordingPlan: { ...recordingPlan, outputs } });
}

export async function trashProject(input: TrashProjectInput): Promise<ProjectTrashReceipt> {
  log("project_trash_requested", { projectId: input.projectId });
  const project = await readStoredProject(input.projectId);
  assertRevision(project, input.revision);
  const trashedAt = new Date().toISOString();
  const target = await trashTarget(project.id, trashedAt);
  await rename(projectDirectory(project.id), target);
  return { projectId: project.id, title: project.title, trashPath: target, trashedAt };
}

async function summarizeProject(id: string): Promise<ProjectSummary> {
  const project = await readStoredProject(id);
  const updatedAt = (await stat(join(projectDirectory(id), "project.json"))).mtime.toISOString();
  return { id, title: project.title, sourceName: project.sourceName, createdAt: project.createdAt, updatedAt, revision: project.revision, sceneCount: project.scenes.length, exportCount: project.exportHistory.length };
}

async function trashTarget(id: string, trashedAt: string) {
  const directory = join(runtimeRoot, "trash", "projects");
  await mkdir(directory, { recursive: true });
  return join(directory, `${id}-${trashedAt.replace(/[:.]/g, "-")}`);
}

function assertRevision(project: VideoProject, expected: number) {
  if (project.revision !== expected) throw new ProjectRevisionConflict(project.id, expected, project.revision);
}

function isProjectDirectory(entry: Dirent) {
  return entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name);
}

function log(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "cutroom-project-catalog", event, ...details }));
}

type RenameProjectInput = { projectId: string; revision: number; title: string };
type TrashProjectInput = { projectId: string; revision: number };

import type { Dirent } from "node:fs";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectSummary, ProjectTrashReceipt, VideoProject } from "../src/analysis-model";
import { normalizeProjectTitle } from "../src/ProjectTitle";
import { projectsRoot, runtimeRoot } from "./media-analysis";
import { ProjectRevisionConflict, projectDirectory, readStoredProject, writeStoredProject } from "./project-store";
import { recordingPlanForProject } from "../src/RecordingPlanModel";
