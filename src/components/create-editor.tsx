'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react';
import { CREATE_CATEGORY_LABELS, type CreateCategory, type CreateProjectType } from '@/lib/create';

type CreativeProject = {
  id: string;
  title: string;
  description: string;
  category: CreateCategory;
  projectType: CreateProjectType;
  status: 'draft' | 'archived';
  favorite: boolean;
  assetIds: string[];
  data: Record<string, unknown>;
  revision: number;
};
type DesignElement = {
  id: string;
  type: 'text' | 'rect' | 'ellipse' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  color?: string;
  fill?: string;
  fontSize?: number;
  fontFamily?: string;
  rotation?: number;
  src?: string;
};
type CreateAsset = { id: string; name: string; url: string; mimeType: string; kind: string };
type EditorError = { error?: string };

async function getError(response: Response) {
  const body = await response.json().catch(() => ({})) as EditorError;
  return body.error ?? `Request failed (${response.status}).`;
}

function valueAsString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}
function valueAsNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function projectElements(data: Record<string, unknown>) {
  return Array.isArray(data.elements) ? data.elements.filter((item): item is DesignElement => !!item && typeof item === 'object' && 'id' in item && 'type' in item) : [];
}

export function CreateEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<CreativeProject | null>(null);
  const [title, setTitle] = useState('');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [assets, setAssets] = useState<CreateAsset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [versions, setVersions] = useState<Array<{ id: string; revision: number; title: string; createdAt: string }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastSavedKey = useRef('');
  const projectRef = useRef<CreativeProject | null>(null);
  const latestRef = useRef<{ title: string; data: Record<string, unknown> }>({ title: '', data: {} });

  const recordExport = useCallback(async (format: string) => {
    try {
      const response = await fetch(`/api/create/projects/${projectId}/exports`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format }),
      });
      if (!response.ok) throw new Error(await getError(response));
    } catch (exportError) {
      setError(exportError instanceof Error ? `File exported, but its history could not be saved: ${exportError.message}` : 'File exported, but its history could not be saved.');
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [projectResponse, assetResponse] = await Promise.all([
          fetch(`/api/create/projects/${projectId}`, { cache: 'no-store' }),
          fetch(`/api/create/assets?projectId=${projectId}`, { cache: 'no-store' }),
        ]);
        if (!projectResponse.ok) throw new Error(await getError(projectResponse));
        if (!assetResponse.ok) throw new Error(await getError(assetResponse));
        const projectBody = await projectResponse.json() as { project: CreativeProject };
        const assetBody = await assetResponse.json() as { assets: CreateAsset[] };
        if (!active) return;
        const loadedProject = projectBody.project;
        projectRef.current = loadedProject;
        latestRef.current = { title: loadedProject.title, data: loadedProject.data };
        lastSavedKey.current = JSON.stringify([loadedProject.title, loadedProject.data]);
        setProject(loadedProject);
        setTitle(loadedProject.title);
        setData(loadedProject.data);
        setAssets(assetBody.assets);
        setLoaded(true);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Project could not be opened.');
      }
    })();
    return () => { active = false; };
  }, [projectId]);

  const saveKey = JSON.stringify([title, data]);
  useEffect(() => {
    latestRef.current = { title, data };
    if (!loaded || !projectRef.current || saveKey === lastSavedKey.current) return;
    const timer = window.setTimeout(() => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      setSaving(true);
      setError('');
      void fetch(`/api/create/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || 'Untitled project', data, revision: currentProject.revision }),
      }).then(async response => {
        if (!response.ok) throw new Error(await getError(response));
        const body = await response.json() as { project: CreativeProject };
        projectRef.current = body.project;
        setProject(body.project);
        lastSavedKey.current = saveKey;
        setNotice('All changes saved');
      }).catch(saveError => {
        setError(saveError instanceof Error ? saveError.message : 'Changes could not be saved.');
        setNotice('');
      }).finally(() => setSaving(false));
    }, 750);
    return () => window.clearTimeout(timer);
  }, [data, loaded, projectId, saveKey, title]);

  const updateData = useCallback((update: Record<string, unknown>) => {
    setData(previous => ({ ...previous, ...update }));
    setNotice('Saving changes…');
  }, []);

  async function uploadFile(file: File) {
    const form = new FormData();
    form.set('file', file);
    form.set('projectId', projectId);
    const response = await fetch('/api/create/assets', { method: 'POST', body: form });
    if (!response.ok) throw new Error(await getError(response));
    const body = await response.json() as { asset: CreateAsset };
    setAssets(previous => [body.asset, ...previous]);
    return body.asset;
  }

  async function showVersions() {
    setShowHistory(value => !value);
    if (versions.length) return;
    const response = await fetch(`/api/create/projects/${projectId}/versions`, { cache: 'no-store' });
    if (!response.ok) { setError(await getError(response)); return; }
    const body = await response.json() as { versions: typeof versions };
    setVersions(body.versions);
  }

  async function restoreVersion(versionId: string) {
    const response = await fetch(`/api/create/projects/${projectId}/versions?versionId=${versionId}`, { method: 'POST' });
    if (!response.ok) { setError(await getError(response)); return; }
    const body = await response.json() as { project: { data: Record<string, unknown>; title: string; revision: number } };
    setTitle(body.project.title);
    setData(body.project.data);
    const current = projectRef.current;
    if (current) {
      const next = { ...current, title: body.project.title, data: body.project.data, revision: body.project.revision };
      projectRef.current = next;
      setProject(next);
      lastSavedKey.current = JSON.stringify([body.project.title, body.project.data]);
    }
    setNotice('Version restored');
  }

  function reportError(message: string) {
    setError(message);
    setNotice('');
  }

  if (!loaded) return <main className="create-editor-loading"><p role={error ? 'alert' : 'status'}>{error || 'Opening your creative workspace…'}</p><Link href="/create">Back to CREATE</Link></main>;
  if (!project) return null;
  const Editor = project.projectType === 'design' ? DesignEditor
    : project.projectType === 'image' ? ImageEditor
      : project.projectType === 'video' ? VideoEditor
        : project.projectType === 'presentation' ? PresentationEditor
          : project.projectType === 'audio' ? AudioEditor
            : TextEditor;

  return (
    <main className="create-editor-shell">
      <header className="create-editor-top">
        <Link className="create-back-link" href="/create" aria-label="Back to CREATE">← <span>CREATE</span></Link>
        <div className="create-editor-project"><span>{CREATE_CATEGORY_LABELS[project.category]}</span><input aria-label="Project title" maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /><span className="create-save-state" role="status">{saving ? 'Saving…' : notice || 'Saved'}</span></div>
        <div className="create-editor-actions">
          <button type="button" className="create-editor-quiet" onClick={() => void showVersions()} aria-expanded={showHistory}>History</button>
          <button type="button" className="create-primary create-export-trigger" onClick={() => window.dispatchEvent(new CustomEvent('nexora-create-export'))}>Export</button>
        </div>
      </header>
      {error && <div className="create-editor-alert" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {showHistory && <section className="create-history"><div><strong>Version history</strong><button type="button" onClick={() => setShowHistory(false)} aria-label="Close version history">×</button></div>{versions.length ? versions.map(version => <article key={version.id}><span>Revision {version.revision} · {new Date(version.createdAt).toLocaleString()}</span><strong>{version.title}</strong><button type="button" onClick={() => void restoreVersion(version.id)}>Restore</button></article>) : <p>Changes to project content will appear here as you work.</p>}</section>}
      <Editor project={project} data={data} updateData={updateData} assets={assets} uploadFile={uploadFile} reportError={reportError} busy={busy} setBusy={setBusy} onExport={recordExport} />
    </main>
  );
}

type StudioProps = {
  project: CreativeProject;
  data: Record<string, unknown>;
  updateData: (update: Record<string, unknown>) => void;
  assets: CreateAsset[];
  uploadFile: (file: File) => Promise<CreateAsset>;
  reportError: (message: string) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onExport: (format: string) => Promise<void>;
};

function DesignEditor(props: StudioProps) {
  const { data, updateData, uploadFile, reportError } = props;
  const width = Math.min(4000, Math.max(64, valueAsNumber(data.width, 1080)));
  const height = Math.min(4000, Math.max(64, valueAsNumber(data.height, 1080)));
  const elements = projectElements(data);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(55);
  const [grid, setGrid] = useState(false);
  const [undoStack, setUndoStack] = useState<DesignElement[][]>([]);
  const [redoStack, setRedoStack] = useState<DesignElement[][]>([]);
  const selectedElement = elements.find(item => item.id === selected);
  const svgRef = useRef<SVGSVGElement>(null);
  const moving = useRef<{ id: string; x: number; y: number; startX: number; startY: number; elements: DesignElement[] } | null>(null);
  const saveElements = (next: DesignElement[]) => {
    setUndoStack(stack => [...stack.slice(-29), elements]);
    setRedoStack([]);
    updateData({ elements: next });
  };
  function addElement(type: DesignElement['type']) {
    const item: DesignElement = {
      id: crypto.randomUUID(), type, x: 120 + elements.length * 22, y: 120 + elements.length * 20,
      width: type === 'text' ? 500 : 210, height: type === 'text' ? 72 : 145,
      text: type === 'text' ? 'Your idea, in focus.' : undefined,
      color: '#20221d', fill: type === 'ellipse' ? '#d6f26a' : 'transparent', fontSize: 44, fontFamily: 'Arial',
    };
    saveElements([...elements, item]);
    setSelected(item.id);
  }
  function pointerDown(event: PointerEvent<SVGElement>, item: DesignElement) {
    if (event.button !== 0 || !svgRef.current) return;
    moving.current = { id: item.id, x: item.x, y: item.y, startX: event.clientX, startY: event.clientY, elements };
    (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
    setSelected(item.id);
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const active = moving.current;
    if (!active || !svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const dx = (event.clientX - active.startX) * width / bounds.width;
    const dy = (event.clientY - active.startY) * height / bounds.height;
    updateData({ elements: elements.map(item => item.id === active.id ? { ...item, x: Math.max(0, active.x + dx), y: Math.max(0, active.y + dy) } : item) });
  }
  function pointerUp() {
    if (!moving.current) return;
    setUndoStack(stack => [...stack.slice(-29), moving.current!.elements]);
    setRedoStack([]);
    moving.current = null;
  }
  function editElement(update: Partial<DesignElement>) {
    if (!selected) return;
    saveElements(elements.map(item => item.id === selected ? { ...item, ...update } : item));
  }
  function downloadSvg() {
    const serialize = (source: DesignElement[]) => {
      const nodes = source.map(item => {
        const transform = `transform="rotate(${item.rotation ?? 0} ${item.x + item.width / 2} ${item.y + item.height / 2})"`;
        if (item.type === 'text') return `<text x="${item.x}" y="${item.y + (item.fontSize ?? 44)}" font-family="${escapeXml(item.fontFamily ?? 'Arial')}" font-size="${item.fontSize ?? 44}" fill="${escapeXml(item.color ?? '#20221d')}" ${transform}>${escapeXml(item.text ?? '')}</text>`;
        if (item.type === 'image') return `<image href="${escapeXml(item.src ?? '')}" x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" preserveAspectRatio="xMidYMid slice" ${transform}/>`;
        if (item.type === 'ellipse') return `<ellipse cx="${item.x + item.width / 2}" cy="${item.y + item.height / 2}" rx="${item.width / 2}" ry="${item.height / 2}" fill="${escapeXml(item.fill ?? '#d6f26a')}" ${transform}/>`;
        return `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" fill="${escapeXml(item.fill ?? '#d6f26a')}" ${transform}/>`;
      }).join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${escapeXml(valueAsString(data.background, '#ffffff'))}"/>${nodes}</svg>`;
    };
    void (async () => {
      let markup = serialize(elements);
      for (const item of elements.filter(element => element.type === 'image' && element.src?.startsWith('/'))) {
        const response = await fetch(item.src!);
        if (!response.ok) throw new Error('An image layer could not be loaded for export.');
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        markup = markup.replaceAll(escapeXml(item.src!), dataUrl);
      }
      downloadBlob(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), 'nexora-design.svg');
      await props.onExport('svg');
    })().catch(error => reportError(error instanceof Error ? error.message : 'SVG export failed.'));
  }
  function downloadPng() {
    void (async () => {
      let svg = new XMLSerializer().serializeToString(svgRef.current!);
      for (const item of elements.filter(element => element.type === 'image' && element.src?.startsWith('/'))) {
        const response = await fetch(item.src!);
        if (!response.ok) throw new Error('An image layer could not be loaded for export.');
        const dataUrl = await blobToDataUrl(await response.blob());
        svg = svg.replaceAll(escapeXml(item.src!), dataUrl);
      }
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas export is not supported in this browser.');
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (blob) {
          downloadBlob(blob, 'nexora-design.png');
          void props.onExport('png');
        }
      }, 'image/png');
    })().catch(error => reportError(error instanceof Error ? error.message : 'PNG export failed.'));
  }
  useEffect(() => {
    const handler = () => downloadPng();
    window.addEventListener('nexora-create-export', handler);
    return () => window.removeEventListener('nexora-create-export', handler);
  });
  async function insertImage(file?: File) {
    if (!file) return;
    try {
      const asset = await uploadFile(file);
      const image = new Image(); image.src = asset.url; await image.decode();
      const fit = Math.min(600 / image.naturalWidth, 500 / image.naturalHeight, 1);
      const item: DesignElement = { id: crypto.randomUUID(), type: 'image', x: 120, y: 120, width: image.naturalWidth * fit, height: image.naturalHeight * fit, src: asset.url };
      saveElements([...elements, item]); setSelected(item.id);
    } catch (error) { reportError(error instanceof Error ? error.message : 'The image could not be added.'); }
  }
  async function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    await insertImage(file);
    event.target.value = '';
  }
  function dropImage(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void insertImage(file);
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || !event.key.toLowerCase().match(/^[zy]$/)) return;
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey && undoStack.length) {
        event.preventDefault();
        const previous = undoStack.at(-1)!;
        setUndoStack(stack => stack.slice(0, -1));
        setRedoStack(stack => [...stack, elements]);
        updateData({ elements: previous });
      } else if ((event.key.toLowerCase() === 'y' || event.shiftKey) && redoStack.length) {
        event.preventDefault();
        const next = redoStack.at(-1)!;
        setRedoStack(stack => stack.slice(0, -1));
        setUndoStack(stack => [...stack, elements]);
        updateData({ elements: next });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [elements, redoStack, undoStack, updateData]);
  const canUndo = undoStack.length > 0;
  return <div className="create-studio-layout">
    <aside className="create-studio-tools">
      <div className="create-tool-heading"><span>CANVAS TOOLS</span><small>{width} × {height}</small></div>
      <div className="create-tool-grid">
        <button type="button" onClick={() => addElement('text')}><span>T</span>Add text</button>
        <button type="button" onClick={() => addElement('rect')}><span>□</span>Rectangle</button>
        <button type="button" onClick={() => addElement('ellipse')}><span>○</span>Ellipse</button>
        <label className="create-tool-upload"><span>▧</span>Add image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => void addImage(event)} /></label>
      </div>
      <div className="create-tool-controls">
        <label>Canvas background<input type="color" value={valueAsString(data.background, '#ffffff')} onChange={event => updateData({ background: event.target.value })} /></label>
        <label>Canvas width<input type="number" min="64" max="4000" value={width} onChange={event => updateData({ width: Math.min(4000, Math.max(64, Number(event.target.value) || width)) })} /></label>
        <label>Canvas height<input type="number" min="64" max="4000" value={height} onChange={event => updateData({ height: Math.min(4000, Math.max(64, Number(event.target.value) || height)) })} /></label>
        <label className="create-checkbox-row"><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} />Show grid</label>
      </div>
      {selectedElement && <div className="create-selected-controls"><div className="create-tool-heading"><span>SELECTED LAYER</span><button type="button" onClick={() => { saveElements(elements.filter(item => item.id !== selected)); setSelected(null); }}>Delete</button></div>
        {selectedElement.type === 'text' && <><label>Text<input value={selectedElement.text ?? ''} maxLength={400} onChange={event => editElement({ text: event.target.value })} /></label><label>Font<select value={selectedElement.fontFamily ?? 'Arial'} onChange={event => editElement({ fontFamily: event.target.value })}><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Courier New</option></select></label><label>Font size<input type="range" min="10" max="160" value={selectedElement.fontSize ?? 44} onChange={event => editElement({ fontSize: Number(event.target.value) })} /></label><label>Text color<input type="color" value={selectedElement.color ?? '#20221d'} onChange={event => editElement({ color: event.target.value })} /></label></>}
        {(selectedElement.type === 'rect' || selectedElement.type === 'ellipse') && <label>Fill<input type="color" value={selectedElement.fill === 'transparent' ? '#ffffff' : selectedElement.fill ?? '#d6f26a'} onChange={event => editElement({ fill: event.target.value })} /></label>}
        <label>Rotation<input type="range" min="-180" max="180" value={selectedElement.rotation ?? 0} onChange={event => editElement({ rotation: Number(event.target.value) })} /></label>
        <label>Width<input type="number" min="10" max={width} value={Math.round(selectedElement.width)} onChange={event => editElement({ width: Number(event.target.value) || 10 })} /></label>
        <label>Height<input type="number" min="10" max={height} value={Math.round(selectedElement.height)} onChange={event => editElement({ height: Number(event.target.value) || 10 })} /></label>
      </div>}
      <div className="create-layers"><div className="create-tool-heading"><span>LAYERS · {elements.length}</span><div><button type="button" disabled={!canUndo} aria-label="Undo" onClick={() => { const previous = undoStack.at(-1); if (!previous) return; setUndoStack(stack => stack.slice(0, -1)); setRedoStack(stack => [...stack, elements]); updateData({ elements: previous }); }}>↶</button><button type="button" disabled={!redoStack.length} aria-label="Redo" onClick={() => { const next = redoStack.at(-1); if (!next) return; setRedoStack(stack => stack.slice(0, -1)); setUndoStack(stack => [...stack, elements]); updateData({ elements: next }); }}>↷</button></div></div>{elements.map((item, index) => <button type="button" className={selected === item.id ? 'is-selected' : ''} key={item.id} onClick={() => setSelected(item.id)}><span>{item.type === 'text' ? 'T' : item.type === 'image' ? '▧' : item.type === 'ellipse' ? '○' : '□'}</span>{item.text?.slice(0, 24) || `${item.type} ${index + 1}`}</button>)}</div>
    </aside>
    <section className="create-canvas-area" aria-label="Design canvas">
      <div className="create-canvas-toolbar"><span>DESIGN STUDIO</span><label>Zoom <input type="range" min="20" max="100" value={zoom} onChange={event => setZoom(Number(event.target.value))} /><small>{zoom}%</small></label><button type="button" onClick={downloadSvg}>Export SVG</button><button type="button" onClick={downloadPng}>Export PNG</button></div>
      <div className="create-canvas-stage" onDragOver={event => event.preventDefault()} onDrop={dropImage}><svg ref={svgRef} className={grid ? 'create-design-canvas show-grid' : 'create-design-canvas'} viewBox={`0 0 ${width} ${height}`} style={{ width: `${zoom}%`, maxWidth: '100%', background: valueAsString(data.background, '#ffffff') }} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} role="img" aria-label={`${titleFromProject(props.project)} design canvas`}>
        {grid && <defs><pattern id="create-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#96998f" strokeWidth="1" opacity=".22" /></pattern></defs>}
        {grid && <rect width="100%" height="100%" fill="url(#create-grid)" pointerEvents="none" />}
        {elements.map(item => <g key={item.id} transform={`rotate(${item.rotation ?? 0} ${item.x + item.width / 2} ${item.y + item.height / 2})`} className={selected === item.id ? 'create-canvas-selected' : ''} onPointerDown={event => pointerDown(event, item)} onDoubleClick={() => setSelected(item.id)} style={{ cursor: 'move' }}>
          {item.type === 'text' ? <text x={item.x} y={item.y + (item.fontSize ?? 44)} fontSize={item.fontSize ?? 44} fontFamily={item.fontFamily ?? 'Arial'} fill={item.color ?? '#20221d'}>{item.text}</text>
            : item.type === 'image' ? <image href={item.src} x={item.x} y={item.y} width={item.width} height={item.height} preserveAspectRatio="xMidYMid slice" />
              : item.type === 'ellipse' ? <ellipse cx={item.x + item.width / 2} cy={item.y + item.height / 2} rx={item.width / 2} ry={item.height / 2} fill={item.fill ?? '#d6f26a'} />
                : <rect x={item.x} y={item.y} width={item.width} height={item.height} fill={item.fill ?? '#d6f26a'} />}
          <rect x={item.x} y={item.y} width={item.width} height={item.height} fill="transparent" stroke={selected === item.id ? '#8ca34d' : 'transparent'} strokeDasharray="8 5" />
        </g>)}
      </svg></div>
      <p className="create-canvas-hint">Select a layer to edit. Drag elements to arrange them; your work saves automatically.</p>
    </section>
  </div>;
}

function ImageEditor(props: StudioProps) {
  const { data, updateData, assets, uploadFile, reportError } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [providerMessage, setProviderMessage] = useState('Checking media provider status…');
  const [overlayText, setOverlayText] = useState(valueAsString(data.overlayText));
  const [overlayColor, setOverlayColor] = useState(valueAsString(data.overlayColor, '#ffffff'));
  const assetId = valueAsString(data.assetId);
  useEffect(() => {
    let active = true;
    void fetch('/api/create/providers', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(await getError(response));
      const body = await response.json() as { providers: { image: { configured: boolean; message: string } } };
      if (active) setProviderMessage(body.providers.image.configured ? 'An image provider is configured.' : body.providers.image.message);
    }).catch(() => { if (active) setProviderMessage('Image generation is unavailable. Local image editing remains available.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const found = assets.find(asset => asset.id === assetId && asset.kind === 'image');
    if (!found) { setImageUrl(''); imageRef.current = null; setImageDimensions({ width: 0, height: 0 }); return; }
    setImageUrl(found.url);
    const image = new Image();
    image.onload = () => { imageRef.current = image; setImageDimensions({ width: image.naturalWidth, height: image.naturalHeight }); draw(); };
    image.onerror = () => reportError('The selected image could not be previewed.');
    image.src = found.url;
  }, [assetId, assets]);
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const rotation = valueAsNumber(data.rotation, 0);
    const sideways = Math.abs(rotation % 180) === 90;
    const sourceWidth = image.naturalWidth * Math.min(100, Math.max(1, valueAsNumber(data.cropWidth, 100))) / 100;
    const sourceHeight = image.naturalHeight * Math.min(100, Math.max(1, valueAsNumber(data.cropHeight, 100))) / 100;
    const rotatedWidth = sideways ? sourceHeight : sourceWidth;
    const rotatedHeight = sideways ? sourceWidth : sourceHeight;
    canvas.width = Math.min(4000, Math.max(1, valueAsNumber(data.outputWidth, rotatedWidth)));
    canvas.height = Math.min(4000, Math.max(1, valueAsNumber(data.outputHeight, rotatedHeight)));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = valueAsString(data.background, '#ffffff');
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = `brightness(${valueAsNumber(data.brightness, 100)}%) contrast(${valueAsNumber(data.contrast, 100)}%) saturate(${valueAsNumber(data.saturation, 100)}%) blur(${valueAsNumber(data.blur, 0)}px)`;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.scale(canvas.width / rotatedWidth, canvas.height / rotatedHeight);
    context.rotate(rotation * Math.PI / 180);
    context.scale(data.flipX === true ? -1 : 1, data.flipY === true ? -1 : 1);
    const cropX = image.naturalWidth * Math.min(99, Math.max(0, valueAsNumber(data.cropX, 0))) / 100;
    const cropY = image.naturalHeight * Math.min(99, Math.max(0, valueAsNumber(data.cropY, 0))) / 100;
    context.drawImage(image, cropX, cropY, sourceWidth, sourceHeight, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
    context.filter = 'none';
    const shape = valueAsString(data.shapeOverlay);
    if (shape === 'rectangle' || shape === 'ellipse') {
      context.globalAlpha = Math.min(1, Math.max(0, valueAsNumber(data.shapeOpacity, 25) / 100));
      context.fillStyle = valueAsString(data.shapeColor, '#d6f26a');
      if (shape === 'ellipse') {
        context.beginPath();
        context.ellipse(canvas.width / 2, canvas.height / 2, canvas.width * .32, canvas.height * .28, 0, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(canvas.width * .18, canvas.height * .22, canvas.width * .64, canvas.height * .56);
      }
      context.globalAlpha = 1;
    }
    const text = valueAsString(data.overlayText);
    if (text) {
      context.fillStyle = valueAsString(data.overlayColor, '#ffffff');
      context.font = `bold ${Math.max(20, canvas.width * .055)}px Arial`;
      context.textAlign = 'center';
      context.shadowColor = 'rgba(0,0,0,.5)';
      context.shadowBlur = 4;
      context.fillText(text.slice(0, 120), canvas.width / 2, canvas.height * .88, canvas.width * .9);
    }
  }, [data]);
  useEffect(() => { draw(); }, [draw, imageUrl]);
  const sourceWidth = imageDimensions.width * Math.min(100, Math.max(1, valueAsNumber(data.cropWidth, 100))) / 100;
  const sourceHeight = imageDimensions.height * Math.min(100, Math.max(1, valueAsNumber(data.cropHeight, 100))) / 100;
  const rotated = Math.abs(valueAsNumber(data.rotation, 0) % 180) === 90;
  const defaultOutputWidth = rotated ? sourceHeight : sourceWidth;
  const defaultOutputHeight = rotated ? sourceWidth : sourceHeight;
  async function selectFile(file?: File) {
    if (!file) return;
    try {
      const asset = await uploadFile(file);
      updateData({ assetId: asset.id, brightness: 100, contrast: 100, saturation: 100, blur: 0, rotation: 0, flipX: false, flipY: false, cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100, overlayText: '', shapeOverlay: 'none', background: '#ffffff' });
      setOverlayText('');
    } catch (error) { reportError(error instanceof Error ? error.message : 'Image upload failed.'); }
  }
  function exportImage(format: 'image/png' | 'image/jpeg' | 'image/webp') {
    if (!assetId) { reportError('Upload an image before exporting.'); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) { reportError('This image format could not be exported.'); return; }
      const extension = format.split('/')[1];
      downloadBlob(blob, `nexora-image.${extension}`);
      void props.onExport(extension === 'jpeg' ? 'jpeg' : extension);
    }, format, format === 'image/jpeg' ? .92 : undefined);
  }
  useEffect(() => {
    const handler = () => exportImage('image/png');
    window.addEventListener('nexora-create-export', handler);
    return () => window.removeEventListener('nexora-create-export', handler);
  });
  const adjustment = (label: string, key: string, min: number, max: number, step = 1) =>
    <label key={key} className="create-range-control">{label}<span>{valueAsNumber(data[key], key === 'brightness' || key === 'contrast' || key === 'saturation' ? 100 : 0)}{key === 'blur' ? 'px' : '%'}</span><input type="range" min={min} max={max} step={step} value={valueAsNumber(data[key], key === 'brightness' || key === 'contrast' || key === 'saturation' ? 100 : 0)} onChange={event => updateData({ [key]: Number(event.target.value) })} /></label>;
  return <div className="create-media-editor">
    <aside className="create-media-panel"><p className="create-eyebrow">IMAGE STUDIO</p><h2>Make the image yours.</h2><p className="create-provider-unavailable" role="status">{providerMessage}</p><label className="create-primary create-upload-button">Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => void selectFile(event.target.files?.[0])} /></label>
      {assetId && <><div className="create-adjustments">{adjustment('Brightness', 'brightness', 0, 200)}{adjustment('Contrast', 'contrast', 0, 200)}{adjustment('Saturation', 'saturation', 0, 200)}{adjustment('Blur', 'blur', 0, 20)}</div>
        <div className="create-editor-control-row"><button type="button" onClick={() => updateData({ rotation: (valueAsNumber(data.rotation, 0) + 90) % 360 })}>↻ Rotate</button><button type="button" onClick={() => updateData({ flipX: data.flipX !== true })}>⇋ Flip</button><button type="button" onClick={() => updateData({ flipY: data.flipY !== true })}>⇅ Flip</button></div>
        <p className="create-field-label">Crop · position and size (%)</p><div className="create-crop-grid">{[['Left', 'cropX'], ['Top', 'cropY'], ['Width', 'cropWidth'], ['Height', 'cropHeight']].map(([label, key]) => <label key={key}>{label}<input type="number" min="0" max="100" value={valueAsNumber(data[key], key === 'cropWidth' || key === 'cropHeight' ? 100 : 0)} onChange={event => updateData({ [key]: Math.min(100, Math.max(0, Number(event.target.value))) })} /></label>)}</div>
        <p className="create-field-label">Output size · pixels</p><div className="create-crop-grid"><label>Width<input type="number" min="1" max="4000" value={Math.round(valueAsNumber(data.outputWidth, defaultOutputWidth))} onChange={event => updateData({ outputWidth: Math.min(4000, Math.max(1, Number(event.target.value))) })} /></label><label>Height<input type="number" min="1" max="4000" value={Math.round(valueAsNumber(data.outputHeight, defaultOutputHeight))} onChange={event => updateData({ outputHeight: Math.min(4000, Math.max(1, Number(event.target.value))) })} /></label></div>
        <label className="create-field-label">Background<input type="color" value={valueAsString(data.background, '#ffffff')} onChange={event => updateData({ background: event.target.value })} /></label>
        <label className="create-field-label">Shape overlay<select value={valueAsString(data.shapeOverlay, 'none')} onChange={event => updateData({ shapeOverlay: event.target.value })}><option value="none">None</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option></select></label>
        {valueAsString(data.shapeOverlay, 'none') !== 'none' && <><label className="create-field-label">Shape color<input type="color" value={valueAsString(data.shapeColor, '#d6f26a')} onChange={event => updateData({ shapeColor: event.target.value })} /></label>{adjustment('Shape opacity', 'shapeOpacity', 0, 100)}</>}
        <label className="create-field-label">Text overlay<input value={overlayText} maxLength={120} onChange={event => { setOverlayText(event.target.value); updateData({ overlayText: event.target.value }); }} placeholder="Add a caption" /></label>
        <label className="create-field-label">Overlay color<input type="color" value={overlayColor} onChange={event => { setOverlayColor(event.target.value); updateData({ overlayColor: event.target.value }); }} /></label>
        <div className="create-export-options"><button type="button" onClick={() => exportImage('image/png')}>PNG</button><button type="button" onClick={() => exportImage('image/jpeg')}>JPEG</button><button type="button" onClick={() => exportImage('image/webp')}>WebP</button></div>
      </>}
    </aside>
    <section className="create-image-stage">{imageUrl ? <canvas ref={canvasRef} className="create-image-canvas" aria-label="Edited image preview" /> : <div className="create-empty create-upload-empty"><span>▧</span><h3>Choose an image to begin</h3><p>Your edits render locally in this browser. {providerMessage}</p></div>}</section>
  </div>;
}

function TextEditor(props: StudioProps) {
  const { project, data, updateData, reportError, busy, setBusy } = props;
  const text = valueAsString(data.text);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [contentType, setContentType] = useState('Blog post');
  const [tone, setTone] = useState('Clear and useful');
  const [length, setLength] = useState('Medium');
  const [language, setLanguage] = useState('English');
  const [action, setAction] = useState('Write a first draft');
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let active = true;
    void fetch('/api/think/settings', { cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      const body = await response.json() as { provider: { configured: boolean } };
      if (active) setProviderConfigured(body.provider.configured);
    }).catch(() => { if (active) setProviderConfigured(false); });
    return () => { active = false; };
  }, []);
  function format(prefix: string, suffix = prefix) {
    const input = textareaRef.current;
    if (!input) return;
    const start = input.selectionStart, end = input.selectionEnd;
    const selection = text.slice(start, end);
    updateData({ text: `${text.slice(0, start)}${prefix}${selection || 'text'}${suffix}${text.slice(end)}` });
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + prefix.length, end + prefix.length); });
  }
  function exportText(extension: 'md' | 'txt' | 'html') {
    const safeTitle = project.title.replace(/[<>]/g, '');
    const contents = extension === 'html'
      ? `<!doctype html><meta charset="utf-8"><title>${escapeXml(safeTitle)}</title><article><h1>${escapeXml(safeTitle)}</h1><pre style="white-space:pre-wrap;font:16px/1.6 sans-serif">${escapeXml(text)}</pre></article>`
      : text;
    downloadBlob(new Blob([contents], { type: extension === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8' }), `${safeTitle || 'nexora-document'}.${extension}`);
    void props.onExport(extension);
  }
  function printPdf() {
    const popup = window.open('', '_blank');
    if (!popup) { reportError('Allow pop-ups to print or save this document as PDF.'); return; }
    popup.opener = null;
    popup.document.write(`<!doctype html><title>${escapeXml(project.title)}</title><style>body{max-width:760px;margin:50px auto;font:16px/1.7 sans-serif;white-space:pre-wrap}h1{font-size:30px}</style><h1>${escapeXml(project.title)}</h1><main>${escapeXml(text)}</main><script>window.print()<\/script>`);
    popup.document.close();
    void props.onExport('pdf');
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (/\.(pdf|docx)$/i.test(file.name)) {
        const form = new FormData(); form.set('file', file);
        const uploaded = await fetch('/api/think/documents', { method: 'POST', body: form });
        if (!uploaded.ok) throw new Error(await getError(uploaded));
        const body = await uploaded.json() as { document: { id: string } };
        const extracted = await fetch(`/api/think/documents/${body.document.id}`, { cache: 'no-store' });
        if (!extracted.ok) throw new Error(await getError(extracted));
        const content = await extracted.json() as { document: { preview: string } };
        updateData({ text: content.document.preview, format: 'plain' });
      } else {
        updateData({ text: await file.text(), format: file.name.endsWith('.html') ? 'html' : file.name.endsWith('.md') ? 'markdown' : 'plain' });
      }
      reportError('');
    } catch (error) { reportError(error instanceof Error ? error.message : 'The document could not be imported.'); }
  }
  async function thinkAction() {
    setBusy(true);
    try {
      const instruction = `${action} the following ${contentType.toLowerCase()} in ${language}. Tone: ${tone}. Length: ${length}. Preserve the user's facts and do not invent claims. Return only the finished content.\n\n${text ? `Existing material:\n${text.slice(0, 12000)}\n\n` : ''}Project title: ${project.title}`;
      const conversationResponse = await fetch('/api/think/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `CREATE · ${project.title}`, agent: 'writing' }),
      });
      if (!conversationResponse.ok) throw new Error(await getError(conversationResponse));
      const conversation = await conversationResponse.json() as { conversation: { id: string } };
      const response = await fetch(`/api/think/conversations/${conversation.conversation.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: instruction, agent: 'writing' }),
      });
      if (!response.ok) throw new Error(await getError(response));
      if (!response.body) throw new Error('THINK did not return a response stream.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', generated = '', streamError = '';
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const event = frame.match(/^event:\s*(.+)$/m)?.[1];
          const raw = frame.match(/^data:\s*(.+)$/m)?.[1];
          if (!raw) continue;
          const payload = JSON.parse(raw) as { text?: string; message?: string };
          if (event === 'delta') generated += payload.text ?? '';
          if (event === 'error') streamError = payload.message ?? 'THINK could not complete this request.';
        }
        if (done) break;
      }
      if (streamError) throw new Error(streamError);
      if (!generated.trim()) throw new Error('THINK completed without returning content.');
      updateData({ text: action === 'Write a first draft' || !text ? generated : `${text}\n\n${generated}` });
    } catch (error) { reportError(error instanceof Error ? error.message : 'THINK could not complete the request.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const handler = () => exportText('md');
    window.addEventListener('nexora-create-export', handler);
    return () => window.removeEventListener('nexora-create-export', handler);
  });
  return <div className="create-writing-layout">
    <section className="create-writing-main"><div className="create-writing-toolbar"><div><p className="create-eyebrow">{project.projectType === 'document' ? 'DOCUMENT STUDIO' : 'CONTENT STUDIO'}</p><span>Autosaved to your private project</span></div><div><label className="create-import-label">Import TXT / MD / HTML / PDF / DOCX<input type="file" accept=".txt,.md,.markdown,.html,.htm,.pdf,.docx" onChange={event => void importFile(event.target.files?.[0])} /></label><button type="button" onClick={() => setMode(mode === 'write' ? 'preview' : 'write')}>{mode === 'write' ? 'Preview' : 'Write'}</button><button type="button" onClick={() => exportText('md')}>Markdown</button><button type="button" onClick={() => exportText('txt')}>TXT</button><button type="button" onClick={() => exportText('html')}>HTML</button><button type="button" onClick={printPdf}>Print / PDF</button></div></div>
      <div className="create-format-toolbar"><button type="button" onClick={() => format('# ', '')}>Heading</button><button type="button" onClick={() => format('**')}>Bold</button><button type="button" onClick={() => format('*')}>Italic</button><button type="button" onClick={() => format('- ', '')}>List</button><button type="button" onClick={() => format('> ', '')}>Quote</button><button type="button" onClick={() => format('| Column | Column |\n| --- | --- |\n| Cell | Cell |', '')}>Table</button></div>
      {mode === 'write' ? <textarea ref={textareaRef} className="create-document-input" aria-label="Document content" value={text} onChange={event => updateData({ text: event.target.value })} placeholder="Start with a sentence. The rest can follow." spellCheck /> : <article className="create-document-preview"><h1>{project.title}</h1><pre>{text || 'Nothing to preview yet.'}</pre></article>}
      <footer className="create-writing-footer"><span>{text.trim() ? text.trim().split(/\s+/).length : 0} words</span><span>Markdown, text and HTML exports are local. PDF uses your browser's print dialog.</span></footer>
    </section>
    <aside className="create-content-panel"><p className="create-eyebrow">THINK · WRITING AGENT</p><h2>Bring your draft into focus.</h2><p>Writing requests use your existing THINK conversation API, provider settings and rate limits. Provider credentials remain server-side.</p><label>Content type<select value={contentType} onChange={event => setContentType(event.target.value)}>{['Blog post', 'Article', 'Social caption', 'YouTube script', 'Advertisement', 'Product description', 'Email', 'Business proposal', 'Marketing campaign', 'Study notes', 'Report', 'Creative story'].map(item => <option key={item}>{item}</option>)}</select></label><label>Tone<select value={tone} onChange={event => setTone(event.target.value)}>{['Clear and useful', 'Warm and conversational', 'Confident', 'Playful', 'Formal', 'Persuasive', 'Educational'].map(item => <option key={item}>{item}</option>)}</select></label><label>Length<select value={length} onChange={event => setLength(event.target.value)}><option>Short</option><option>Medium</option><option>Long</option></select></label><label>Language<select value={language} onChange={event => setLanguage(event.target.value)}><option>English</option><option>Hindi</option><option>Spanish</option><option>French</option><option>German</option><option>Japanese</option></select></label><label>THINK action<select value={action} onChange={event => setAction(event.target.value)}>{['Write a first draft', 'Rewrite', 'Summarize', 'Expand', 'Proofread', 'Translate', 'Improve', 'Generate variations'].map(item => <option key={item}>{item}</option>)}</select></label><button className="create-primary" type="button" disabled={busy || (providerConfigured === false)} onClick={() => void thinkAction()}>{busy ? 'Working in THINK…' : 'Continue with THINK ↗'}</button>{providerConfigured === false && <p className="create-provider-unavailable" role="status">No THINK provider is configured. You can keep editing and exporting locally; configure the server-side provider to use writing assistance.</p>}{providerConfigured === true && <p className="create-provider-ready">THINK provider configured · requests use your account settings.</p>}<Link href="/speak">Use SPEAK for voice input ↗</Link><p className="create-small-note">SPEAK owns microphone and speech recognition. CREATE does not start a second recorder.</p></aside>
  </div>;
}

function PresentationEditor(props: StudioProps) {
  const { project, data, updateData } = props;
  const slides = Array.isArray(data.slides) ? data.slides as Array<{ id: string; title: string; body: string; background: string; notes: string }> : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const slide = slides[activeIndex];
  function updateSlide(update: Partial<(typeof slides)[number]>) {
    updateData({ slides: slides.map((item, index) => index === activeIndex ? { ...item, ...update } : item) });
  }
  function addSlide() {
    updateData({ slides: [...slides, { id: crypto.randomUUID(), title: 'New slide', body: 'Add a thought to this slide.', background: '#f4f3ed', notes: '' }] });
    setActiveIndex(slides.length);
  }
  function exportPdf() {
    const popup = window.open('', '_blank');
    if (!popup) { props.reportError('Allow pop-ups to print or save this deck as PDF.'); return; }
    popup.opener = null;
    const pages = slides.map(item => `<section style="page-break-after:always;min-height:90vh;padding:8vh;background:${escapeXml(item.background)};color:#20221d"><h1 style="font:600 36px/1.2 sans-serif">${escapeXml(item.title)}</h1><p style="font:20px/1.6 sans-serif;white-space:pre-wrap">${escapeXml(item.body)}</p></section>`).join('');
    popup.document.write(`<!doctype html><meta charset="utf-8"><title>${escapeXml(project.title)}</title><style>@page{size:landscape;margin:0}body{margin:0}section{box-sizing:border-box}</style>${pages}<script>window.print()<\/script>`);
    popup.document.close();
    void props.onExport('pdf');
  }
  useEffect(() => {
    const handler = () => exportPdf();
    window.addEventListener('nexora-create-export', handler);
    return () => window.removeEventListener('nexora-create-export', handler);
  });
  useEffect(() => {
    if (!presenting) return;
    function keydown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (event.key === 'Escape') setPresenting(false);
      if (event.key === 'ArrowRight') setActiveIndex(index => Math.min(slides.length - 1, index + 1));
      if (event.key === 'ArrowLeft') setActiveIndex(index => Math.max(0, index - 1));
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [presenting, slides.length]);
  return <div className="create-presentation-layout">
    <aside className="create-slide-list"><div className="create-tool-heading"><span>SLIDES · {slides.length}</span><button type="button" onClick={addSlide}>＋ Add slide</button></div>{slides.map((item, index) => <button type="button" className={index === activeIndex ? 'is-selected' : ''} key={item.id} onClick={() => setActiveIndex(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title || 'Untitled slide'}</strong></button>)}</aside>
    <section className="create-slide-workspace"><div className="create-canvas-toolbar"><span>PRESENTATION STUDIO</span><button type="button" onClick={() => setPresenting(true)}>Present</button><button type="button" onClick={exportPdf}>Export PDF</button></div>{slide ? <><div className="create-slide-preview" style={{ background: slide.background }}><h2>{slide.title}</h2><p>{slide.body}</p></div><div className="create-slide-controls"><label>Title<input value={slide.title} maxLength={160} onChange={event => updateSlide({ title: event.target.value })} /></label><label>Slide text<textarea value={slide.body} maxLength={5000} onChange={event => updateSlide({ body: event.target.value })} /></label><label>Speaker notes<textarea value={slide.notes} maxLength={3000} onChange={event => updateSlide({ notes: event.target.value })} /></label><label>Background<input type="color" value={slide.background} onChange={event => updateSlide({ background: event.target.value })} /></label><div><button type="button" disabled={activeIndex === 0} onClick={() => { const next = [...slides]; [next[activeIndex - 1], next[activeIndex]] = [next[activeIndex], next[activeIndex - 1]]; updateData({ slides: next }); setActiveIndex(index => index - 1); }}>Move earlier</button><button type="button" disabled={activeIndex === slides.length - 1} onClick={() => { const next = [...slides]; [next[activeIndex + 1], next[activeIndex]] = [next[activeIndex], next[activeIndex + 1]]; updateData({ slides: next }); setActiveIndex(index => index + 1); }}>Move later</button><button type="button" onClick={() => { updateData({ slides: [...slides, { ...slide, id: crypto.randomUUID(), title: `${slide.title} copy`.slice(0, 160) }] }); setActiveIndex(slides.length); }}>Duplicate</button><button type="button" disabled={slides.length <= 1} onClick={() => { updateData({ slides: slides.filter((_, index) => index !== activeIndex) }); setActiveIndex(Math.max(0, activeIndex - 1)); }}>Delete</button></div></div></> : <div className="create-empty"><p>Add a slide to begin.</p></div>}</section>
    {presenting && slide && <div className="create-present-overlay" role="dialog" aria-modal="true" aria-label="Presentation mode" onClick={event => { if (event.target === event.currentTarget) setPresenting(false); }}><button type="button" className="create-present-close" onClick={() => setPresenting(false)} aria-label="Exit presentation">×</button><div className="create-slide-present" style={{ background: slide.background }}><small>{activeIndex + 1} / {slides.length}</small><h2>{slide.title}</h2><p>{slide.body}</p></div><nav><button type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex(activeIndex - 1)}>← Previous</button><button type="button" disabled={activeIndex === slides.length - 1} onClick={() => setActiveIndex(activeIndex + 1)}>Next →</button></nav><p>Use your ← and → keys to navigate; Esc to exit.</p></div>}
  </div>;
}

function VideoEditor(props: StudioProps) {
  const { data, updateData, assets, uploadFile, reportError } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [duration, setDuration] = useState(0);
  const [recording, setRecording] = useState(false);
  const assetId = valueAsString(data.assetId);
  const video = assets.find(asset => asset.id === assetId && asset.kind === 'video');
  const audio = assets.find(asset => asset.id === valueAsString(data.audioAssetId) && asset.kind === 'audio');
  const trimStart = Math.max(0, valueAsNumber(data.trimStart, 0));
  const trimEnd = Math.min(duration || Infinity, valueAsNumber(data.trimEnd, duration || 0));
  async function selectFile(file?: File) {
    if (!file) return;
    try { const asset = await uploadFile(file); updateData({ assetId: asset.id, trimStart: 0, trimEnd: null }); }
    catch (error) { reportError(error instanceof Error ? error.message : 'The video upload failed.'); }
  }
  async function selectAudio(file?: File) {
    if (!file) return;
    try { const asset = await uploadFile(file); updateData({ audioAssetId: asset.id }); }
    catch (error) { reportError(error instanceof Error ? error.message : 'The audio upload failed.'); }
  }
  function splitClip() {
    const current = videoRef.current?.currentTime ?? 0;
    if (current <= trimStart || current >= trimEnd) { reportError('Move the playhead inside the selected trim range to split the clip.'); return; }
    updateData({ clips: [...(Array.isArray(data.clips) ? data.clips as number[] : []), Number(current.toFixed(2))].sort((a, b) => a - b) });
  }
  function exportTrim() {
    if (!video) { reportError('Upload a video before exporting a trim.'); return; }
    const element = videoRef.current as (HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }) | null;
    const capture = element?.captureStream ?? element?.mozCaptureStream;
    if (!element || !capture || !window.MediaRecorder) { reportError('Trim export is not supported by this browser. Playback and timeline controls still work.'); return; }
    const stream = capture.call(element);
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { reportError('This browser cannot encode a WebM trim. Try a current desktop browser.'); return; }
    chunks.current = [];
    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      recorder.onerror = () => { setRecording(false); reportError('Browser video recording failed. The original clip remains unchanged.'); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunks.current, { type: mimeType });
        if (blob.size) {
          downloadBlob(blob, 'nexora-video-trim.webm');
          void props.onExport('webm');
        }
        setRecording(false);
      };
      element.currentTime = trimStart;
      void element.play().then(() => { recorder.start(); setRecording(true); }).catch(() => reportError('Press play on the video first, then retry trim export.'));
    } catch (error) { reportError(error instanceof Error ? error.message : 'The browser could not start video capture.'); }
  }
  function stopExport() {
    if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop();
    videoRef.current?.pause();
  }
  function timeUpdate() {
    const element = videoRef.current;
    if (recording && element && element.currentTime >= trimEnd) stopExport();
  }
  useEffect(() => {
    const handler = () => exportTrim();
    window.addEventListener('nexora-create-export', handler);
    return () => window.removeEventListener('nexora-create-export', handler);
  });
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = valueAsNumber(data.volume, 1);
  }, [data.volume]);
  return <div className="create-video-layout"><aside className="create-media-panel"><p className="create-eyebrow">VIDEO STUDIO</p><h2>A practical clip workspace.</h2><p>Native browser playback, seeking and WebM capture. No server renderer is configured.</p><label className="create-primary create-upload-button">Upload video<input type="file" accept="video/mp4,video/webm,.mp4,.webm" onChange={event => void selectFile(event.target.files?.[0])} /></label>{video && <><label>Start · {formatTime(trimStart)}<input type="range" min="0" max={duration} step=".05" value={Math.min(trimStart, duration)} onChange={event => updateData({ trimStart: Number(event.target.value) })} /></label><label>End · {formatTime(trimEnd)}<input type="range" min={trimStart} max={duration} step=".05" value={Math.min(trimEnd, duration)} onChange={event => updateData({ trimEnd: Number(event.target.value) })} /></label><label>Volume<input type="range" min="0" max="1" step=".05" value={valueAsNumber(data.volume, 1)} onChange={event => { updateData({ volume: Number(event.target.value) }); if (videoRef.current) videoRef.current.volume = Number(event.target.value); }} /></label><label>Aspect ratio<select value={valueAsString(data.aspectRatio, 'source')} onChange={event => updateData({ aspectRatio: event.target.value })}><option value="source">Original</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></label><label>Captions<textarea value={valueAsString(data.captions)} maxLength={5000} onChange={event => updateData({ captions: event.target.value })} placeholder="Add caption text" /></label><label className="create-import-label">Add background audio<input type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" onChange={event => void selectAudio(event.target.files?.[0])} /></label>{audio && <audio src={audio.url} controls />}
        <button type="button" onClick={splitClip}>Split at playhead</button>{recording ? <button type="button" onClick={stopExport}>Stop WebM export</button> : <button type="button" onClick={exportTrim}>Export selected trim · WebM</button>}<p className="create-small-note">WebM capture depends on browser captureStream and MediaRecorder codec support. Captions, overlays and background audio are editable notes here; they are not composited into export.</p>
      </>}            </aside><section className="create-video-workspace">{video ? <><div className={`create-video-frame ratio-${valueAsString(data.aspectRatio, 'source').replace(':', '-')}`}><video ref={videoRef} src={video.url} controls playsInline onLoadedMetadata={event => { setDuration(event.currentTarget.duration); event.currentTarget.volume = valueAsNumber(data.volume, 1); if (data.trimEnd === null) updateData({ trimEnd: event.currentTarget.duration }); }} onTimeUpdate={timeUpdate} /></div><div className="create-video-timeline"><div><span>0:00</span><input type="range" min="0" max={duration || 0} step=".05" value={Math.min(videoRef.current?.currentTime ?? 0, duration)} onChange={event => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value); }} aria-label="Video timeline" /><span>{formatTime(duration)}</span></div><div className="create-trim-track"><i style={{ left: `${duration ? trimStart / duration * 100 : 0}%`, width: `${duration ? Math.max(0, (trimEnd - trimStart) / duration * 100) : 0}%` }} />{(Array.isArray(data.clips) ? data.clips as number[] : []).map(cut => <b key={cut} style={{ left: `${duration ? cut / duration * 100 : 0}%` }} title={`Split at ${formatTime(cut)}`} />)}</div><p>{valueAsString(data.captions) || 'Add captions in the inspector. Use the trim controls to define an export range.'}</p>{audio && <audio className="create-audio-preview" src={audio.url} controls />}</div></> : <div className="create-empty create-upload-empty"><span>▷</span><h3>Bring in a clip</h3><p>MP4 and WebM uploads are kept privately and played through the browser's native video element.</p></div>}</section></div>;
}

function AudioEditor(props: StudioProps) {
  const { data, updateData, assets, uploadFile, reportError } = props;
  const [audioAsset, setAudioAsset] = useState<CreateAsset | null>(assets.find(item => item.id === valueAsString(data.assetId) && item.kind === 'audio') ?? null);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { const asset = await uploadFile(file); setAudioAsset(asset); updateData({ assetId: asset.id }); }
    catch (error) { reportError(error instanceof Error ? error.message : 'The audio upload failed.'); }
  }
  function exportAudio() {
    if (!audioAsset) { reportError('Upload an audio file before exporting.'); return; }
    const anchor = document.createElement('a');
    anchor.href = audioAsset.url;
    anchor.download = audioAsset.name;
    anchor.click();
    void props.onExport(audioAsset.name.toLowerCase().endsWith('.wav') ? 'wav' : 'mp3');
  }
  useEffect(() => {
    const handler = () => exportAudio();
    window.addEventListener('nexora-create-export', handler);
    return () => window.removeEventListener('nexora-create-export', handler);
  });
  return <section className="create-audio-studio"><div><p className="create-eyebrow">AUDIO CONTENT STUDIO</p><h2>Keep the sound close.</h2><p>Upload an MP3 or WAV to store and preview it privately. Browser playback and volume are available; no AI audio generator or audio renderer is configured.</p><label className="create-primary create-upload-button">Upload audio<input type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" onChange={event => void upload(event)} /></label>{audioAsset && <><audio src={audioAsset.url} controls /><label>Playback volume<input type="range" min="0" max="1" step=".05" value={valueAsNumber(data.volume, 1)} onChange={event => { updateData({ volume: Number(event.target.value) }); document.querySelectorAll<HTMLAudioElement>('.create-audio-studio audio').forEach(audio => { audio.volume = Number(event.target.value); }); }} /></label><button type="button" onClick={exportAudio}>Download original file ↗</button></>}</div></section>;
}

function titleFromProject(project: CreativeProject) { return project.title; }
function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The image could not be prepared for export.'));
    reader.readAsDataURL(blob);
  });
}
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
