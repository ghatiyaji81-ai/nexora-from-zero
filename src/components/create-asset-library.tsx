'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Asset = { id: string; name: string; kind: 'image' | 'video' | 'audio' | 'document'; mimeType: string; size: number; folder: string; tags: string[]; favorite: boolean; url: string; createdAt: string };
type Body = { assets?: Asset[]; error?: string };

async function errorMessage(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error ?? `Request failed (${response.status}).`;
}

export function CreateAssetLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [folder, setFolder] = useState('all');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [folders, setFolders] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (kind !== 'all') params.set('kind', kind);
      if (favoriteOnly) params.set('favorite', '1');
      const response = await fetch(`/api/create/assets?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await errorMessage(response));
      const body = await response.json() as Body;
      const items = body.assets ?? [];
      setAssets(items);
      setFolders([...new Set(items.map(item => item.folder).filter(Boolean))].sort());
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'The asset library could not be loaded.'); }
    finally { setLoading(false); }
  }, [favoriteOnly, kind, query]);
  useEffect(() => { void load(); }, [load]);
  const visible = folder === 'all' ? assets : assets.filter(asset => asset.folder === folder);

  async function updateAsset(asset: Asset, update: Record<string, unknown>) {
    setError('');
    const response = await fetch(`/api/create/assets/${asset.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
    if (!response.ok) { setError(await errorMessage(response)); return; }
    await load();
    setNotice('Asset details saved.');
  }
  async function deleteAsset(asset: Asset) {
    if (!window.confirm(`Permanently delete “${asset.name}” and its private file?`)) return;
    const response = await fetch(`/api/create/assets/${asset.id}`, { method: 'DELETE' });
    if (!response.ok) { setError(await errorMessage(response)); return; }
    await load();
    setNotice('Asset deleted.');
  }
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    const form = new FormData(); form.set('file', file);
    const response = await fetch('/api/create/assets', { method: 'POST', body: form });
    if (!response.ok) { setError(await errorMessage(response)); return; }
    await load();
    setNotice('Asset uploaded to your private library.');
  }
  function newFolder(asset: Asset) {
    const value = window.prompt('Folder name', asset.folder || '');
    if (value !== null) void updateAsset(asset, { folder: value.trim() });
  }
  function editTags(asset: Asset) {
    const value = window.prompt('Add up to 12 comma-separated tags', asset.tags.join(', '));
    if (value !== null) void updateAsset(asset, { tags: value.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 12) });
  }

  return <main className="create-assets-page">
    <header className="create-assets-heading"><div><p className="create-eyebrow">YOUR PRIVATE LIBRARY</p><h1>Assets, in their place.</h1><p>Images, clips, audio and documents uploaded to your CREATE projects.</p></div><Link href="/create" className="create-secondary">← Back to CREATE</Link></header>
    <div className="create-assets-toolbar"><label className="create-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search files" aria-label="Search files" /></label><select value={kind} onChange={event => setKind(event.target.value)} aria-label="Filter by file type"><option value="all">All file types</option><option value="image">Images</option><option value="video">Video</option><option value="audio">Audio</option><option value="document">Documents</option></select><select value={folder} onChange={event => setFolder(event.target.value)} aria-label="Filter by folder"><option value="all">All folders</option>{folders.map(name => <option key={name}>{name}</option>)}</select><button type="button" className={favoriteOnly ? 'is-selected' : ''} aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly(value => !value)}>★ Favorites</button><div className="create-view-toggle"><button type="button" className={layout === 'grid' ? 'is-selected' : ''} aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>▦</button><button type="button" className={layout === 'list' ? 'is-selected' : ''} aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>☷</button></div><label className="create-primary create-upload-button">＋ Upload<input type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mp3,.wav,.pdf,.txt" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
    {notice && <p className="create-notice" role="status">{notice}</p>}{error && <p className="create-error" role="alert">{error}</p>}
    {loading ? <div className="create-loading" role="status">Loading your library…</div> : visible.length === 0 ? <div className="create-empty"><span>▧</span><h2>No matching assets</h2><p>Upload an image, video, audio file, PDF or text file to start your library.</p></div> : <div className={`create-assets-grid${layout === 'list' ? ' create-assets-list' : ''}`}>{visible.map(asset => <article className="create-asset-card" key={asset.id}>
      <a className="create-asset-preview" href={asset.url} target="_blank" rel="noreferrer" aria-label={`Preview ${asset.name}`}>{asset.kind === 'image' ? <img src={asset.url} alt={asset.name} loading="lazy" /> : asset.kind === 'video' ? <video src={asset.url} preload="metadata" /> : asset.kind === 'audio' ? <span>♫</span> : <span>¶</span>}</a>
      <div className="create-asset-info"><div><strong>{asset.name}</strong><small>{asset.kind} · {formatBytes(asset.size)}</small></div><button type="button" className={`create-favorite${asset.favorite ? ' is-favorite' : ''}`} onClick={() => void updateAsset(asset, { favorite: !asset.favorite })} aria-label={asset.favorite ? 'Remove asset favorite' : 'Favorite asset'} aria-pressed={asset.favorite}>★</button></div>
      <div className="create-asset-tags">{asset.folder && <span>{asset.folder}</span>}{asset.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
      <div className="create-asset-actions"><button type="button" onClick={() => { const name = window.prompt('Asset name', asset.name); if (name?.trim()) void updateAsset(asset, { name: name.trim() }); }}>Rename</button><button type="button" onClick={() => newFolder(asset)}>Folder</button><button type="button" onClick={() => editTags(asset)}>Tags</button><a href={asset.url} download={asset.name}>Download</a><button type="button" className="create-danger" onClick={() => void deleteAsset(asset)}>Delete</button></div>
    </article>)}</div>}
    <p className="create-asset-security">Asset files are stored in private GridFS and every preview or download checks your signed-in account. Supported uploads: PNG, JPEG, WebP, GIF, MP4, WebM, MP3, WAV, PDF and TXT · 25 MB max.</p>
  </main>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
