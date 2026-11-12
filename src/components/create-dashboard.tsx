'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CREATE_CATEGORIES,
  CREATE_CATEGORY_LABELS,
  CREATE_PROJECT_TEMPLATES,
  type CreateCategory,
  type CreateProjectType,
} from '@/lib/create';

type Project = {
  id: string;
  title: string;
  description: string;
  category: CreateCategory;
  projectType: CreateProjectType;
  status: 'draft' | 'archived';
  favorite: boolean;
  assetCount: number;
  thumbnailUrl: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
type Asset = { id: string; name: string; kind: string; url: string; mimeType: string; createdAt: string };
type ExportRecord = { id: string; projectId: string; projectTitle: string; format: string; createdAt: string };
type Listing = { projects?: Project[]; assets?: Asset[]; exports?: ExportRecord[]; error?: string };

const categoryActions: CreateCategory[] = ['image', 'video', 'graphic-design', 'document', 'presentation', 'social-media', 'marketing', 'audio', 'custom'];

async function responseError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error ?? `Request failed (${response.status}).`;
}

export function CreateDashboard({ displayName }: { displayName: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [category, setCategory] = useState<'all' | CreateCategory>('all');
  const [view, setView] = useState<'recent' | 'favorites' | 'drafts' | 'archived'>('recent');
  const [query, setQuery] = useState('');
  const [createCategory, setCreateCategory] = useState<CreateCategory>('graphic-design');
  const [title, setTitle] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      if (view === 'favorites') params.set('favorite', '1');
      if (view === 'archived') params.set('status', 'archived');
      if (query.trim()) params.set('q', query.trim());
      const [projectResponse, assetResponse, exportResponse] = await Promise.all([
        fetch(`/api/create/projects?${params}`, { cache: 'no-store' }),
        fetch('/api/create/assets', { cache: 'no-store' }),
        fetch('/api/create/exports', { cache: 'no-store' }),
      ]);
      if (!projectResponse.ok) throw new Error(await responseError(projectResponse));
      if (!assetResponse.ok) throw new Error(await responseError(assetResponse));
      if (!exportResponse.ok) throw new Error(await responseError(exportResponse));
      const projectBody = await projectResponse.json() as Listing;
      const assetBody = await assetResponse.json() as Listing;
      const exportBody = await exportResponse.json() as Listing;
      setProjects(projectBody.projects ?? []);
      setAssets(assetBody.assets ?? []);
      setExports(exportBody.exports ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'CREATE could not load your workspace.');
    } finally { setLoading(false); }
  }, [category, query, view]);

  useEffect(() => { void load(); }, [load]);
  const visibleProjects = useMemo(() => view === 'drafts'
    ? projects.filter(project => project.status === 'draft')
    : projects, [projects, view]);
  const favorites = projects.filter(project => project.favorite);
  const drafts = projects.filter(project => project.status === 'draft');

  async function createProject(template?: (typeof CREATE_PROJECT_TEMPLATES)[number]) {
    setBusy(true);
    setError('');
    try {
      const projectTitle = (template?.title ?? title).trim();
      const response = await fetch('/api/create/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: projectTitle || CREATE_CATEGORY_LABELS[template?.category ?? createCategory] + ' project',
          category: template?.category ?? createCategory,
          projectType: template?.projectType,
          width: template?.width,
          height: template?.height,
          description: template?.description,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = await response.json() as { project: Project };
      window.location.assign(`/create/${body.project.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'The project could not be created.');
      setBusy(false);
    }
  }

  async function updateProject(project: Project, update: Record<string, unknown>) {
    setError('');
    try {
      const response = await fetch(`/api/create/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
      });
      if (!response.ok) throw new Error(await responseError(response));
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'The project could not be updated.');
    }
  }

  async function duplicateProject(project: Project) {
    const response = await fetch('/api/create/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `${project.title} copy`.slice(0, 120), category: project.category, projectType: project.projectType, duplicateId: project.id }),
    });
    if (!response.ok) { setError(await responseError(response)); return; }
    await load();
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Delete “${project.title}”? Its uploaded files remain in your asset library.`)) return;
    const response = await fetch(`/api/create/projects/${project.id}`, { method: 'DELETE' });
    if (!response.ok) { setError(await responseError(response)); return; }
    await load();
  }

  return (
    <main className="create-dashboard">
      <section className="create-hero">
        <div>
          <p className="create-eyebrow">YOUR CREATIVE WORKSPACE</p>
          <h1>Make something<br className="create-hero-break" /> worth sharing, {displayName.split(' ')[0]}.</h1>
          <p className="create-lede">One quiet studio for ideas, visuals, documents and media. Your projects and assets stay in your private workspace.</p>
          <div className="create-hero-actions">
            <button type="button" className="create-primary" onClick={() => { setModalOpen(true); setTitle(''); }}>＋ New project</button>
            <Link className="create-secondary" href="/create/assets">Browse asset library <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <div className="create-hero-note"><span className="create-note-mark">N</span><strong>From first draft<br />to final export.</strong><small>Local tools work without AI credentials.</small></div>
      </section>

      <section className="create-quick" aria-labelledby="create-quick-title">
        <div className="create-section-heading"><div><p className="create-eyebrow">START WITH A FORMAT</p><h2 id="create-quick-title">What are you making?</h2></div><Link href="/create/assets">Your assets <span aria-hidden="true">↗</span></Link></div>
        <div className="create-category-grid">
          {categoryActions.map((item, index) => (
            <button className="create-category-card" type="button" key={item} onClick={() => { setCreateCategory(item); setTitle(''); setModalOpen(true); }}>
              <span className={`create-category-symbol create-symbol-${index}`} aria-hidden="true">{['▧', '▷', '✳', '¶', '▤', '◉', '◈', '♫', '＋'][index]}</span>
              <span><strong>{CREATE_CATEGORY_LABELS[item]}</strong><small>{['Edit and export images', 'Trim and review clips', 'Compose a visual canvas', 'Write and format pages', 'Build a slide deck', 'Create social-ready work', 'Make campaign assets', 'Review audio files', 'Start with a blank studio'][index]}</small></span>
              <span className="create-category-arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      </section>

      <section className="create-templates" aria-labelledby="create-templates-title">
        <div className="create-section-heading"><div><p className="create-eyebrow">A THOUGHTFUL FIRST STEP</p><h2 id="create-templates-title">Start from a canvas</h2></div><span className="create-subtle">Original NEXORA layouts</span></div>
        <div className="create-template-row">
          {CREATE_PROJECT_TEMPLATES.map((template, index) => (
            <button className="create-template-card" type="button" key={template.title} disabled={busy} onClick={() => void createProject(template)}>
              <span className={`create-template-art create-template-art-${index % 5}`} aria-hidden="true"><i /><i /><i /></span>
              <strong>{template.title}</strong><small>{template.width} × {template.height}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="create-project-section" aria-labelledby="create-projects-title">
        <div className="create-section-heading create-project-heading"><div><p className="create-eyebrow">YOUR WORK IN PROGRESS</p><h2 id="create-projects-title">{view === 'favorites' ? 'Favorite projects' : view === 'archived' ? 'Archived projects' : view === 'drafts' ? 'Drafts' : 'Recent projects'}</h2></div>
          <div className="create-project-tools">
            <label className="create-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search projects" /></label>
            <select value={category} onChange={event => setCategory(event.target.value as 'all' | CreateCategory)} aria-label="Filter by category"><option value="all">All categories</option>{CREATE_CATEGORIES.map(item => <option value={item} key={item}>{CREATE_CATEGORY_LABELS[item]}</option>)}</select>
            <select value={view} onChange={event => setView(event.target.value as typeof view)} aria-label="Project view"><option value="recent">Recent</option><option value="favorites">Favorites ({favorites.length})</option><option value="drafts">Drafts ({drafts.length})</option><option value="archived">Archived</option></select>
          </div>
        </div>
        {error && <p className="create-error" role="alert">{error}</p>}
        {loading ? <div className="create-loading" role="status">Loading your projects…</div> : visibleProjects.length === 0 ? (
          <div className="create-empty"><span aria-hidden="true">✳</span><h3>No projects here yet</h3><p>Choose a studio above or create your first project. Your drafts will appear here.</p><button className="create-secondary" type="button" onClick={() => setModalOpen(true)}>Create a project</button></div>
        ) : <div className="create-project-grid">{visibleProjects.map(project => (
          <article className="create-project-card" key={project.id}>
            <Link className={`create-project-preview create-preview-${project.projectType}`} href={`/create/${project.id}`} aria-label={`Open ${project.title}`}>
              {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" loading="lazy" /> : <span className="create-preview-orbit" aria-hidden="true">N</span>}<span className="create-preview-type">{project.projectType}</span>
            </Link>
            <div className="create-project-card-body">
              <div><p className="create-project-category">{CREATE_CATEGORY_LABELS[project.category]}</p><Link href={`/create/${project.id}`}><h3>{project.title}</h3></Link><small>Edited {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(project.updatedAt))} · {project.assetCount} assets</small></div>
              <button type="button" className={`create-favorite${project.favorite ? ' is-favorite' : ''}`} onClick={() => void updateProject(project, { favorite: !project.favorite })} aria-label={project.favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={project.favorite}>★</button>
            </div>
            <details className="create-project-menu"><summary aria-label={`Project actions for ${project.title}`}>•••</summary><div>
              <button type="button" onClick={() => { const next = window.prompt('Project name', project.title); if (next?.trim()) void updateProject(project, { title: next.trim() }); }}>Rename</button>
              <button type="button" onClick={() => void duplicateProject(project)}>Make a copy</button>
              {project.status === 'archived' ? <button type="button" onClick={() => void updateProject(project, { status: 'draft' })}>Restore from archive</button> : <button type="button" onClick={() => void updateProject(project, { status: 'archived' })}>Archive</button>}
              <button type="button" className="create-danger" onClick={() => void deleteProject(project)}>Delete project</button>
            </div></details>
          </article>
        ))}</div>}
      </section>

      <section className="create-bottom-grid">
        <div className="create-mini-panel"><div className="create-section-heading"><div><p className="create-eyebrow">RECENT FILES</p><h2>Recent assets</h2></div><Link href="/create/assets">View library ↗</Link></div>
          {assets.length ? <div className="create-recent-assets">{assets.slice(0, 4).map(asset => <a href={asset.url} key={asset.id} target="_blank" rel="noreferrer"><span className="create-asset-icon">{asset.kind === 'image' ? '▧' : asset.kind === 'video' ? '▷' : asset.kind === 'audio' ? '♫' : '¶'}</span><span><strong>{asset.name}</strong><small>{asset.kind} · {asset.mimeType}</small></span><span aria-hidden="true">↗</span></a>)}</div> : <p className="create-panel-empty">Files you upload in a studio will be collected here.</p>}
        </div>
        <div className="create-mini-panel create-activity-panel"><p className="create-eyebrow">WORKSPACE PULSE</p><h2>A little momentum.</h2><p>{drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'} ready when you are. {favorites.length ? `${favorites.length} saved favorite${favorites.length === 1 ? '' : 's'} close at hand.` : 'Mark a project as a favorite to keep it close.'}</p><Link href="/create/assets">Manage your creative library ↗</Link><p className="create-ai-note">THINK writing is available when its server-side AI provider is configured. Local editing never depends on it.</p></div>
      </section>
      <section className="create-export-history" aria-labelledby="create-exports-title"><div className="create-section-heading"><div><p className="create-eyebrow">YOUR FINISHED WORK</p><h2 id="create-exports-title">Export history</h2></div></div>{exports.length ? <div>{exports.slice(0, 6).map(item => <Link href={`/create/${item.projectId}`} key={item.id}><span>{item.format.toUpperCase()}</span><strong>{item.projectTitle}</strong><small>{new Date(item.createdAt).toLocaleString()}</small><b aria-hidden="true">↗</b></Link>)}</div> : <p className="create-panel-empty">Exports you create in a studio will be listed here.</p>}</section>
      <footer className="create-footer"><span>NEXORA CREATE / Your private studio</span><span>Make with care. Keep what matters.</span></footer>

      {modalOpen && <div className="create-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setModalOpen(false); }}>
        <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-modal-title">
          <button type="button" className="create-modal-close" onClick={() => setModalOpen(false)} aria-label="Close">×</button>
          <p className="create-eyebrow">NEW CREATIVE PROJECT</p><h2 id="create-modal-title">Give your idea a place.</h2><p>Choose a workspace. You can change and export the project at any time.</p>
          <label>Project type<select value={createCategory} onChange={event => setCreateCategory(event.target.value as CreateCategory)}>{CREATE_CATEGORIES.map(item => <option key={item} value={item}>{CREATE_CATEGORY_LABELS[item]}</option>)}</select></label>
          <label>Project name<input autoFocus maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder={`Untitled ${CREATE_CATEGORY_LABELS[createCategory].toLowerCase()}`} onKeyDown={event => { if (event.key === 'Enter' && !busy) void createProject(); }} /></label>
          {error && <p className="create-error" role="alert">{error}</p>}
          <div className="create-modal-actions"><button type="button" className="create-secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancel</button><button type="button" className="create-primary" disabled={busy} onClick={() => void createProject()}>{busy ? 'Creating…' : 'Create project'}</button></div>
        </section>
      </div>}
    </main>
  );
}
