'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BUILD_TEMPLATES, type BuildTemplateId } from '@/lib/build';

type Project = {
  id: string;
  title: string;
  description: string;
  template: BuildTemplateId;
  status: 'active' | 'archived';
  tags: string[];
  fileCount: number;
  createdAt: string;
  updatedAt: string;
};

type Providers = {
  think: { configured: boolean; models: string[] };
  sandbox: { configured: boolean; reason: string };
  github: { configured: boolean; reason: string };
  deployment: { configured: boolean; reason: string };
};

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? 'The request could not be completed.';
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

export function BuildDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<BuildTemplateId>('blank');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProjects = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({ status: archived ? 'archived' : 'active' });
    if (query.trim()) params.set('q', query.trim());
    const response = await fetch(`/api/build/projects?${params}`, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(await responseError(response));
    const body = await response.json() as { projects: Project[] };
    setProjects(body.projects);
  }, [archived, query]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      loadProjects(controller.signal).then(() => setError('')).catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Projects could not be loaded.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadProjects]);

  useEffect(() => {
    fetch('/api/build/providers', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(await responseError(response));
      setProviders(await response.json() as Providers);
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Provider status is unavailable.'));
  }, []);

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      const response = await fetch('/api/build/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, template }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = await response.json() as { project: { id: string } };
      window.location.assign(`/build/${body.project.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The project could not be created.');
      setCreating(false);
    }
  }

  async function updateProject(project: Project, patch: { title?: string; status?: 'active' | 'archived' }) {
    const response = await fetch(`/api/build/projects/${project.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(await responseError(response));
    await loadProjects();
  }

  async function renameProject(project: Project) {
    const nextTitle = window.prompt('Rename project', project.title)?.trim();
    if (!nextTitle || nextTitle === project.title) return;
    try { await updateProject(project, { title: nextTitle }); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The project could not be renamed.'); }
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Permanently delete "${project.title}" and its private project files?`)) return;
    try {
      const response = await fetch(`/api/build/projects/${project.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await responseError(response));
      await loadProjects();
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The project could not be deleted.'); }
  }

  async function duplicateProject(project: Project) {
    try {
      const response = await fetch(`/api/build/projects/${project.id}/duplicate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Copy of ${project.title}`.slice(0, 120) }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      await loadProjects();
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The project could not be duplicated.'); }
  }

  async function exportProject(project: Project) {
    try {
      const response = await fetch(`/api/build/projects/${project.id}/export`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.title.replace(/[^A-Za-z0-9._-]+/g, '-') || 'build-project'}.nexora-build.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The project could not be exported.'); }
  }

  return (
    <main className="build-page">
      <header className="build-welcome">
        <div><p className="eyebrow">BUILD / ENGINEERING WORKSPACE</p><h1>Your ideas,<br />under your control.</h1><p className="build-intro">Edit private project files, review AI-proposed changes, and inspect code without running untrusted programs on the NEXORA server.</p></div>
        <a className="build-primary-link" href="#new-project">Create project <span aria-hidden="true">＋</span></a>
      </header>

      {error && <p className="build-error" role="alert">{error}</p>}

      <section className="build-status-grid" aria-label="Integration status">
        <article className="build-status-card"><span className={`build-status-dot${providers?.think.configured ? ' is-ready' : ''}`} /><div><strong>THINK coding</strong><small>{providers?.think.configured ? `Connected · ${providers.think.models.length} model(s)` : 'Provider not configured'}</small></div><Link href="/think">Open THINK</Link></article>
        <article className="build-status-card"><span className="build-status-dot" /><div><strong>Code execution</strong><small>{providers?.sandbox.reason ?? 'Checking provider status…'}</small></div><span className="build-status-label">Unavailable</span></article>
        <article className="build-status-card"><span className="build-status-dot" /><div><strong>GitHub</strong><small>{providers?.github.reason ?? 'Checking provider status…'}</small></div><span className="build-status-label">Unavailable</span></article>
        <article className="build-status-card"><span className="build-status-dot" /><div><strong>Deployment</strong><small>{providers?.deployment.reason ?? 'Checking provider status…'}</small></div><span className="build-status-label">Unavailable</span></article>
      </section>

      <section className="build-create-card" id="new-project" aria-labelledby="build-create-title">
        <div><p className="eyebrow">START SOMETHING</p><h2 id="build-create-title">New project</h2><p>Starter files are stored privately. BUILD does not install packages or run project code.</p></div>
        <form className="build-create-form" onSubmit={event => void createProject(event)}>
          <label>Project name<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required placeholder="e.g. Northstar API" /></label>
          <label>Starter template<select value={template} onChange={event => setTemplate(event.target.value as BuildTemplateId)}>{BUILD_TEMPLATES.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create workspace'}</button>
        </form>
        <p className="build-template-note">{BUILD_TEMPLATES.find(item => item.id === template)?.description} Dependencies are not installed; use an external isolated environment to run this project.</p>
      </section>

      <section className="build-project-section" aria-labelledby="build-project-title">
        <div className="build-section-heading"><div><p className="eyebrow">{archived ? 'ARCHIVE' : 'YOUR WORK'}</p><h2 id="build-project-title">{archived ? 'Archived projects' : 'My projects'}</h2></div><button type="button" className="build-quiet-button" onClick={() => setArchived(value => !value)}>{archived ? 'Show active' : 'Show archived'}</button></div>
        <div className="build-project-toolbar"><label className="build-search">⌕<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search projects" /></label><span>{projects.length} project{projects.length === 1 ? '' : 's'}</span></div>
        {loading ? <p className="build-empty-state">Loading your projects…</p> : projects.length === 0 ? <p className="build-empty-state">{query ? 'No projects match that search.' : archived ? 'No archived projects.' : 'No projects yet. Choose a starter above to begin.'}</p> : (
          <div className="build-project-grid">{projects.map(project => (
            <article className="build-project-card" key={project.id}>
              <Link href={`/build/${project.id}`} className="build-project-open"><span className="build-project-icon" aria-hidden="true">{project.template === 'python' ? 'Py' : project.template === 'html' ? '</>' : '{ }'}</span><span className="build-project-updated">Updated {dateLabel(project.updatedAt)}</span><h3>{project.title}</h3><p>{project.description || BUILD_TEMPLATES.find(item => item.id === project.template)?.name}</p><span className="build-project-meta">{project.fileCount} files <span>·</span> {project.status}</span></Link>
              <div className="build-project-actions"><button type="button" onClick={() => void renameProject(project)}>Rename</button><button type="button" onClick={() => void duplicateProject(project)}>Duplicate</button><button type="button" onClick={() => void exportProject(project)}>Export</button><button type="button" onClick={() => void updateProject(project, { status: archived ? 'active' : 'archived' }).catch(reason => setError(reason.message))}>{archived ? 'Restore' : 'Archive'}</button><button type="button" onClick={() => void deleteProject(project)}>Delete</button></div>
            </article>
          ))}</div>
        )}
      </section>

      <section className="build-limits-card"><div><p className="eyebrow">SAFETY BOUNDARY</p><h2>Editing works without execution.</h2><p>Terminal commands, tests, builds, live previews, Git operations, dependency installs, and deployments remain blocked until an isolated provider is configured. Imported archives are not accepted yet.</p></div><span>NO CODE RUNS HERE</span></section>
    </main>
  );
}
