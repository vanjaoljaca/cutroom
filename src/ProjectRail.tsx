export function ProjectRail({ open, currentProjectId, onClose, onProjectRenamed, onProjectTrashed }: ProjectRailProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { if (open) void refreshProjects(setProjects, setError); }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;

  async function saveName(project: ProjectSummary) {
    setBusyId(project.id);
    try {
      const renamed = await renameProject(project, draft);
      await refreshProjects(setProjects, setError);
      setEditingId(null);
      onProjectRenamed(renamed);
    } catch (caught) { setError(message(caught)); }
    finally { setBusyId(null); }
  }

  async function removeProject(project: ProjectSummary) {
    if (!confirm(`Delete “${displayProjectTitle(project.title)}”?\n\nIt will be moved to Cutroom Trash and can be recovered.`)) return;
    setBusyId(project.id);
    try {
      const receipt = await trashProject(project);
      setProjects((current) => current.filter((item) => item.id !== project.id));
      onProjectTrashed(receipt);
    } catch (caught) { setError(message(caught)); }
    finally { setBusyId(null); }
  }

  function beginRename(project: ProjectSummary) {
    setEditingId(project.id);
    setDraft(displayProjectTitle(project.title));
    setError("");
  }

  return <><button className="project-rail-scrim" aria-label="Dismiss projects" onClick={onClose} /><aside className="project-rail" aria-label="Projects">
    <header><div className="header-brand"><button className="projects-button rail-projects-button" aria-label="Close projects" title="Close projects" onClick={onClose}><List size={22} weight="bold" /></button><span className="wordmark">Projects</span></div></header>
    <div className="project-list">{projects.map((project) => <section className={project.id === currentProjectId ? "project-row current" : "project-row"} key={project.id}>
      {editingId === project.id ? <form onSubmit={(event) => { event.preventDefault(); void saveName(project); }}><input aria-label={`Name ${displayProjectTitle(project.title)}`} autoFocus maxLength={80} value={draft} onChange={(event) => setDraft(event.target.value)} /><button aria-label="Save project name" disabled={busyId === project.id}><Check size={15} /></button></form> : <a href={canonicalProjectPath(project.id)}><strong>{displayProjectTitle(project.title)}</strong><span>{project.sceneCount} scenes · {project.exportCount} exports</span><small>{project.id === currentProjectId ? "Current · " : ""}Created {projectDate(project.createdAt)}</small></a>}
      <div className="project-row-actions"><button aria-label={`Rename ${displayProjectTitle(project.title)}`} title="Rename" onClick={() => beginRename(project)}><PencilSimple size={14} /></button><button aria-label={`Delete ${displayProjectTitle(project.title)}`} title="Delete" disabled={busyId === project.id} onClick={() => { void removeProject(project); }}><Trash size={14} /></button></div>
    </section>)}</div>
    {!projects.length && !error && <p className="project-list-empty">No projects yet.</p>}
    {error && <p className="project-rail-error" role="alert">{error}</p>}
    <footer><strong>New work</strong><span>Give recordings to a Codex task. One recording can feed several projects; one project can use several recordings.</span></footer>
  </aside></>;
}

async function refreshProjects(setProjects: Dispatch<SetStateAction<ProjectSummary[]>>, setError: Dispatch<SetStateAction<string>>) {
  try { setProjects(await projectRequest<ProjectSummary[]>("/api/projects")); setError(""); }
  catch (error) { setError(message(error)); }
}

async function renameProject(project: ProjectSummary, title: string) {
  return projectRequest<VideoProject>(`/api/projects/${project.id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ title, revision: project.revision }) });
}

async function trashProject(project: ProjectSummary) {
  return projectRequest<ProjectTrashReceipt>(`/api/projects/${project.id}`, { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ revision: project.revision }) });
}

async function projectRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Project request failed.");
  return result as T;
}

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

function projectDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "unknown" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

type ProjectRailProps = { open: boolean; currentProjectId: string | null; onClose: () => void; onProjectRenamed: (project: VideoProject) => void; onProjectTrashed: (receipt: ProjectTrashReceipt) => void };
const jsonHeaders = { "content-type": "application/json" };

import { Check, List, PencilSimple, Trash } from "@phosphor-icons/react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ProjectSummary, ProjectTrashReceipt, VideoProject } from "./analysis-model";
import { displayProjectTitle } from "./ProjectTitle";
import { canonicalProjectPath } from "./ProjectRoute";
