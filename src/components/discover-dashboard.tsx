'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { discoverResearchPrompt } from '@/lib/discover';

type ProviderStatus = { configured: boolean; description: string };
type Providers = { localDocuments: ProviderStatus; think: ProviderStatus; webSearch: ProviderStatus; news: ProviderStatus; academic: ProviderStatus };
type Collection = { id: string; title: string; description: string; archived: boolean; sourceCount: number; updatedAt?: string };
type SearchHit = { documentId: string; title: string; mimeType: string; createdAt: string; excerpt: string; start: number; end: number };
type SavedSource = { id: string; documentId: string; title: string; mimeType: string; excerpt: string; start: number; end: number; collectionId: string | null; note: string; tags: string[] };
type SearchHistory = { id: string; query: string; exactPhrase: boolean; resultCount: number; createdAt: string };
type Report = { id: string; taskId: string; title: string; markdown?: string; createdAt: string };
type Citation = { url: string; title: string };
type Section = 'search' | 'library' | 'research' | 'history' | 'settings';

const sections: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'library', label: 'Research library', icon: '▤' },
  { id: 'research', label: 'Reports', icon: '↗' },
  { id: 'history', label: 'Search history', icon: '◷' },
  { id: 'settings', label: 'Providers', icon: '◇' },
];

export function DiscoverDashboard({ displayName }: { displayName: string }) {
  const [section, setSection] = useState<Section>('search');
  const [providers, setProviders] = useState<Providers | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sources, setSources] = useState<SavedSource[]>([]);
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [query, setQuery] = useState('');
  const [exactPhrase, setExactPhrase] = useState(true);
  const [sort, setSort] = useState<'relevance' | 'recent'>('relevance');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [selectedHits, setSelectedHits] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [collectionTitle, setCollectionTitle] = useState('');
  const [editingCollectionId, setEditingCollectionId] = useState('');
  const [editingCollectionTitle, setEditingCollectionTitle] = useState('');
  const [editingCollectionDescription, setEditingCollectionDescription] = useState('');
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [reportQuestion, setReportQuestion] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const aiAbort = useRef<AbortController | null>(null);

  const activeCollections = useMemo(() => collections.filter(collection => !collection.archived), [collections]);
  const searchEnabled = query.trim().length >= 2 && !busy;
  const canAskThink = Boolean(providers?.think.configured && (selectedHits.length || providers.webSearch.configured)) && !busy;

  const loadCollections = useCallback(async () => {
    const response = await fetch('/api/discover/collections', { cache: 'no-store' });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json() as { collections: Collection[] };
    setCollections(data.collections);
  }, []);

  const loadSources = useCallback(async (collectionId = '') => {
    const suffix = collectionId ? `?collectionId=${encodeURIComponent(collectionId)}` : '';
    const response = await fetch(`/api/discover/sources${suffix}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json() as { sources: SavedSource[] };
    setSources(data.sources);
  }, []);

  const loadReports = useCallback(async () => {
    const response = await fetch('/api/discover/research', { cache: 'no-store' });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json() as { reports: Report[] };
    setReports(data.reports);
  }, []);

  const loadHistory = useCallback(async () => {
    const response = await fetch('/api/discover/search', { cache: 'no-store' });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json() as { searches: SearchHistory[] };
    setHistory(data.searches);
  }, []);

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/discover/providers', { cache: 'no-store' });
      if (!response.ok) throw new Error(await readError(response));
      const providerData = await response.json() as { providers: Providers };
      setProviders(providerData.providers);
      await Promise.all([loadCollections(), loadReports(), loadHistory()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'DISCOVER could not load your workspace.');
    }
  }, [loadCollections, loadHistory, loadReports]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { void loadSources(libraryFilter).catch(loadError => setError(loadError.message)); }, [libraryFilter, loadSources]);

  async function runSearch(event?: FormEvent, searchText = query, phrase = exactPhrase) {
    event?.preventDefault();
    const normalized = searchText.trim();
    if (normalized.length < 2) return;
    setBusy(true);
    setError('');
    setNotice('');
    setSelectedHits([]);
    try {
      const response = await fetch('/api/discover/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: normalized, exactPhrase: phrase, sort,
          ...(dateFrom ? { from: new Date(`${dateFrom}T00:00:00.000Z`).toISOString() } : {}),
          ...(dateTo ? { to: new Date(`${dateTo}T23:59:59.999Z`).toISOString() } : {}),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json() as { results: SearchHit[]; notice: string; limits: { searchedDocuments: number } };
      setResults(data.results);
      setQuery(normalized);
      setNotice(`${data.notice} Checked up to ${data.limits.searchedDocuments} matching documents.`);
      await loadHistory();
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Search could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/think/documents', { method: 'POST', body: form });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json() as { document: { name: string } };
      setNotice(`${data.document.name} was added to your private THINK document library. Search its extracted text here.`);
      if (query.trim().length >= 2) await runSearch(undefined, query);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The document could not be uploaded.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function createCollection(event: FormEvent) {
    event.preventDefault();
    if (!collectionTitle.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/discover/collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: collectionTitle.trim() }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json() as { collection: Collection };
      setCollectionTitle('');
      setSelectedCollection(data.collection.id);
      await loadCollections();
      setNotice('Collection created.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'The collection could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function saveHit(hit: SearchHit) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/discover/sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: hit.documentId, start: hit.start, end: hit.end,
          ...(selectedCollection ? { collectionId: selectedCollection } : {}),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await Promise.all([loadSources(libraryFilter), loadCollections()]);
      setNotice('Evidence excerpt saved to your private research library.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The evidence could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function updateSource(sourceId: string, patch: { collectionId?: string | null; note?: string; tags?: string[] }) {
    const response = await fetch(`/api/discover/sources/${sourceId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(await readError(response));
    await Promise.all([loadSources(libraryFilter), loadCollections()]);
  }

  async function deleteSource(sourceId: string) {
    setError('');
    try {
      const response = await fetch(`/api/discover/sources/${sourceId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response));
      setSelectedSources(current => current.filter(id => id !== sourceId));
      await Promise.all([loadSources(libraryFilter), loadCollections()]);
      setNotice('Saved source removed. Its private original document was not deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The saved source could not be removed.');
    }
  }

  async function createReport(event: FormEvent) {
    event.preventDefault();
    if (selectedSources.length === 0 || reportQuestion.trim().length < 2) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/discover/research', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: reportQuestion.trim(), sourceIds: selectedSources }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json() as { report: Report; notice: string };
      setActiveReport(data.report);
      setNotice(data.notice);
      setSection('research');
      await loadReports();
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'The report could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  async function openReport(reportId: string) {
    setError('');
    try {
      const response = await fetch(`/api/discover/research/${reportId}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json() as { report: Report };
      setActiveReport(data.report);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'The report could not be opened.');
    }
  }

  async function askThink(event: FormEvent) {
    event.preventDefault();
    const question = aiQuestion.trim();
    if (question.length < 2 || !canAskThink) return;
    setBusy(true);
    setAiBusy(true);
    setError('');
    setAiAnswer('');
    setCitations([]);
    const controller = new AbortController();
    aiAbort.current = controller;
    try {
      const agent = selectedHits.length === 0 && providers?.webSearch.configured ? 'research' : 'analysis';
      const conversationResponse = await fetch('/api/think/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Discover: ${question.slice(0, 68)}`, agent }),
        signal: controller.signal,
      });
      if (!conversationResponse.ok) throw new Error(await readError(conversationResponse));
      const conversationData = await conversationResponse.json() as { conversation: { id: string } };
      const messageResponse = await fetch(`/api/think/conversations/${conversationData.conversation.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: discoverResearchPrompt(question),
          agent,
          ...(selectedHits.length ? { documentIds: selectedHits.slice(0, 5) } : {}),
        }),
        signal: controller.signal,
      });
      if (!messageResponse.ok) throw new Error(await readError(messageResponse));
      if (!messageResponse.body) throw new Error('THINK returned an empty response stream.');
      const reader = messageResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      const foundCitations: Citation[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            processThinkEvent(buffer.slice(0, boundary), chunk => {
              text += chunk;
              setAiAnswer(text);
            }, citation => {
              if (!foundCitations.some(item => item.url === citation.url)) foundCitations.push(citation);
              setCitations([...foundCitations]);
            }, setError);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\n\n');
          }
        }
        if (buffer.trim()) processThinkEvent(buffer, chunk => { text += chunk; setAiAnswer(text); }, citation => {
          if (!foundCitations.some(item => item.url === citation.url)) foundCitations.push(citation);
          setCitations([...foundCitations]);
        }, setError);
      } catch (streamError) {
        await reader.cancel().catch(() => undefined);
        throw streamError;
      } finally {
        reader.releaseLock();
      }
      if (!text.trim()) throw new Error('THINK did not return an answer.');
      setNotice(selectedHits.length
        ? 'AI interpretation of your selected private documents. Verify statements against the original excerpts.'
        : foundCitations.length ? 'THINK research completed with provider-supplied source citations.' : 'THINK answered without web search citations. Treat the response as unverified.');
    } catch (thinkError) {
      if (thinkError instanceof DOMException && thinkError.name === 'AbortError') setNotice('THINK response canceled.');
      else setError(thinkError instanceof Error ? thinkError.message : 'THINK research could not be completed.');
    } finally {
      aiAbort.current = null;
      setAiBusy(false);
      setBusy(false);
    }
  }

  async function archiveCollection(collection: Collection) {
    setError('');
    try {
      const response = await fetch(`/api/discover/collections/${collection.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !collection.archived }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await loadCollections();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'The collection could not be updated.');
    }
  }

  async function saveCollection(collectionId: string, event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch(`/api/discover/collections/${collectionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingCollectionTitle.trim(), description: editingCollectionDescription.trim() }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setEditingCollectionId('');
      await loadCollections();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The collection could not be updated.');
    }
  }

  async function deleteCollection(collection: Collection) {
    if (!window.confirm(`Delete “${collection.title}”? Saved excerpts will be kept without a collection.`)) return;
    setError('');
    try {
      const response = await fetch(`/api/discover/collections/${collection.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response));
      const nextFilter = libraryFilter === collection.id ? '' : libraryFilter;
      if (nextFilter !== libraryFilter) setLibraryFilter(nextFilter);
      await Promise.all([loadCollections(), loadSources(nextFilter)]);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The collection could not be deleted.');
    }
  }

  return (
    <main className="discover-page">
      <header className="discover-top">
        <div>
          <p className="discover-kicker">NEXORA / KNOWLEDGE INTELLIGENCE</p>
          <h1>Find the signal.<br /><span>Keep the evidence.</span></h1>
          <p className="discover-intro">Welcome, {displayName}. Search your private document library, organize source excerpts, and research with THINK when configured.</p>
        </div>
        <div className="discover-status">
          <span className={`discover-status-dot${providers?.think.configured ? ' is-ready' : ''}`} />
          <div><strong>{providers?.think.configured ? 'THINK connected' : 'Local research ready'}</strong><small>{providers?.webSearch.configured ? 'Web search configured' : 'No public web results are being shown'}</small></div>
        </div>
      </header>

      <div className="discover-layout">
        <nav className="discover-nav" aria-label="DISCOVER sections">
          {sections.map(item => (
            <button type="button" aria-current={section === item.id ? 'page' : undefined} className={section === item.id ? 'is-active' : ''} key={item.id} onClick={() => setSection(item.id)}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
          <div className="discover-nav-foot">
            <strong>Private by design</strong>
            <small>Document access is limited to your account. AI analysis sends selected documents only after you ask THINK.</small>
          </div>
        </nav>

        <div className="discover-main">
          {error && <div className="discover-alert" role="alert">{error}</div>}
          {notice && <div className="discover-notice" role="status">{notice}</div>}

          {section === 'search' && (
            <section aria-labelledby="discover-search-title">
              <div className="discover-section-heading">
                <div><p className="discover-kicker">SEARCH HOME</p><h2 id="discover-search-title">Search your knowledge</h2></div>
                <button className="discover-button discover-button-secondary" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>Upload a document</button>
                <input ref={fileInput} className="discover-hidden" type="file" accept=".pdf,.docx,.txt" aria-label="Upload a PDF, DOCX, or TXT document" onChange={event => void uploadDocument(event.currentTarget.files?.[0])} />
              </div>
              <p className="discover-muted">Searches only extracted text from your private THINK documents. This does not search the public web.</p>

              <form className="discover-search-form" onSubmit={event => void runSearch(event)}>
                <label className="discover-search-box">
                  <span aria-hidden="true">⌕</span>
                  <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ask a question or find a phrase in your documents…" aria-label="Search your documents" minLength={2} maxLength={240} />
                  <button className="discover-button" type="submit" disabled={!searchEnabled}>{busy ? 'Searching…' : 'Search library'}</button>
                </label>
                <div className="discover-filters">
                  <label className="discover-check"><input type="checkbox" checked={exactPhrase} onChange={event => setExactPhrase(event.target.checked)} /> Exact phrase</label>
                  <label>Sort <select value={sort} onChange={event => setSort(event.target.value as 'relevance' | 'recent')}><option value="relevance">Relevance</option><option value="recent">Newest</option></select></label>
                  <label>From <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
                  <label>To <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
                  <label>Save to <select value={selectedCollection} onChange={event => setSelectedCollection(event.target.value)}><option value="">Uncollected</option>{activeCollections.map(collection => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select></label>
                </div>
              </form>

              {results.length > 0 ? <div className="discover-results">
                <div className="discover-results-heading"><h3>{results.length} matching excerpts</h3><span>Select documents to ask THINK</span></div>
                {results.map((hit, index) => <article className="discover-result" key={`${hit.documentId}-${hit.start}`}>
                  <div className="discover-result-meta"><span>DOC {String(index + 1).padStart(2, '0')}</span><span>{hit.mimeType.replace('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCX').replace('application/pdf', 'PDF').replace('text/plain', 'TXT')}</span><time dateTime={hit.createdAt}>{new Date(hit.createdAt).toLocaleDateString()}</time></div>
                  <h3>{hit.title}</h3>
                  <blockquote>{hit.excerpt}</blockquote>
                  <div className="discover-result-actions">
                    <label className="discover-check"><input type="checkbox" checked={selectedHits.includes(hit.documentId)} onChange={() => setSelectedHits(previous => previous.includes(hit.documentId) ? previous.filter(id => id !== hit.documentId) : previous.length < 5 ? [...previous, hit.documentId] : previous)} /> Use in THINK</label>
                    <button className="discover-text-button" type="button" disabled={busy} onClick={() => void saveHit(hit)}>Save excerpt</button>
                    <a className="discover-text-button" href={`/api/think/documents/${hit.documentId}`} target="_blank" rel="noreferrer">Open document</a>
                  </div>
                </article>)}
              </div> : query.trim().length >= 2 && !busy ? <div className="discover-empty"><span aria-hidden="true">∅</span><strong>No matching passages</strong><small>Try a shorter phrase or upload a supported document. Images inside PDFs are not OCR-processed.</small></div> : <div className="discover-empty"><span aria-hidden="true">⌕</span><strong>Your evidence starts here</strong><small>Search for a phrase or upload a PDF, DOCX, or TXT document.</small></div>}

              <form className="discover-think-panel" onSubmit={event => void askThink(event)}>
                <div><p className="discover-kicker">THINK / SUPERVISED ANALYSIS</p><h3>Ask a research question</h3><small>{selectedHits.length ? `${selectedHits.length} document(s) selected. Their content will be sent to THINK after you submit.` : providers?.webSearch.configured ? 'THINK web research is configured. Provider citations will be shown when returned.' : 'Select document results, or configure THINK web search for public research.'}</small></div>
                <label><span className="sr-only">Question for THINK</span><textarea value={aiQuestion} onChange={event => setAiQuestion(event.target.value)} maxLength={1000} placeholder="What should I investigate or explain?" /></label>
                <div className="discover-ai-actions"><button className="discover-button" type="submit" disabled={!canAskThink || aiQuestion.trim().length < 2}>{aiBusy ? 'Working…' : 'Ask THINK'}</button>{aiBusy && <button className="discover-button discover-button-secondary" type="button" onClick={() => aiAbort.current?.abort()}>Cancel response</button>}</div>
                {(aiAnswer || citations.length > 0) && <div className="discover-ai-answer"><strong>AI-generated interpretation — verify against sources</strong><p>{aiAnswer}</p>{citations.length > 0 && <div className="discover-citations"><strong>Provider citations</strong>{citations.map(citation => <a key={citation.url} href={safeHttpLink(citation.url) ?? '#'} target="_blank" rel="noreferrer">{citation.title}</a>)}</div>}</div>}
              </form>
              {!providers?.webSearch.configured && <p className="discover-provider-hint">Public web, news, and academic search are unavailable until a real provider is configured. No placeholder results are generated.</p>}
              {history.length > 0 && <div className="discover-suggestions"><span>Recent searches</span>{history.slice(0, 5).map(item => <button type="button" key={item.id} onClick={() => { setQuery(item.query); setExactPhrase(item.exactPhrase); void runSearch(undefined, item.query, item.exactPhrase); }}>{item.query}</button>)}</div>}
            </section>
          )}

          {section === 'library' && (
            <section aria-labelledby="discover-library-title">
              <div className="discover-section-heading"><div><p className="discover-kicker">SAVED EVIDENCE</p><h2 id="discover-library-title">Research library</h2></div><select aria-label="Filter by collection" value={libraryFilter} onChange={event => setLibraryFilter(event.target.value)}><option value="">All saved sources</option>{collections.map(collection => <option key={collection.id} value={collection.id}>{collection.title}{collection.archived ? ' (archived)' : ''}</option>)}</select></div>
              <div className="discover-library-grid">
                <div className="discover-collections">
                  <h3>Collections</h3>
                  <form onSubmit={event => void createCollection(event)}><input value={collectionTitle} onChange={event => setCollectionTitle(event.target.value)} maxLength={100} placeholder="New collection name" aria-label="New collection name" /><button className="discover-button" type="submit" disabled={busy || !collectionTitle.trim()}>Create</button></form>
                  {collections.map(collection => <div className="discover-collection-row" key={collection.id}>
                    {editingCollectionId === collection.id ? <form className="discover-collection-edit" onSubmit={event => void saveCollection(collection.id, event)}><input value={editingCollectionTitle} onChange={event => setEditingCollectionTitle(event.target.value)} aria-label="Collection title" maxLength={100} required /><input value={editingCollectionDescription} onChange={event => setEditingCollectionDescription(event.target.value)} aria-label="Collection description" maxLength={500} placeholder="Description (optional)" /><button className="discover-text-button" type="submit">Save</button><button className="discover-text-button" type="button" onClick={() => setEditingCollectionId('')}>Cancel</button></form>
                      : <button type="button" onClick={() => { setLibraryFilter(collection.id); setSection('library'); }}><strong>{collection.title}</strong><small>{collection.sourceCount} saved excerpt{collection.sourceCount === 1 ? '' : 's'}{collection.archived ? ' · archived' : ''}</small></button>}
                    <div className="discover-collection-actions">{editingCollectionId !== collection.id && <button type="button" className="discover-icon-button" aria-label={`Edit ${collection.title}`} onClick={() => { setEditingCollectionId(collection.id); setEditingCollectionTitle(collection.title); setEditingCollectionDescription(collection.description); }}>✎</button>}<button type="button" className="discover-icon-button" aria-label={`${collection.archived ? 'Restore' : 'Archive'} ${collection.title}`} onClick={() => void archiveCollection(collection)}>{collection.archived ? '↶' : '⌑'}</button><button type="button" className="discover-icon-button" aria-label={`Delete ${collection.title}`} onClick={() => void deleteCollection(collection)}>×</button></div>
                  </div>)}
                </div>
                <div className="discover-saved">
                  <div className="discover-saved-heading"><h3>Saved excerpts</h3><span>{sources.length} shown</span></div>
                  {sources.length === 0 ? <div className="discover-empty discover-empty-small"><strong>No saved excerpts yet</strong><small>Save passages from document search results to build a traceable library.</small></div> : sources.map(source => <article className="discover-saved-card" key={source.id}>
                    <label className="discover-check"><input type="checkbox" checked={selectedSources.includes(source.id)} onChange={() => setSelectedSources(current => current.includes(source.id) ? current.filter(id => id !== source.id) : current.length < 10 ? [...current, source.id] : current)} /> Include in report</label>
                    <h4>{source.title}</h4><blockquote>{source.excerpt}</blockquote>
                    <label className="discover-source-note">Research note<textarea defaultValue={source.note} maxLength={1000} onBlur={event => { if (event.currentTarget.value !== source.note) void updateSource(source.id, { note: event.currentTarget.value }).catch(saveError => setError(saveError.message)); }} /></label>
                    <div className="discover-saved-controls"><select aria-label={`Collection for ${source.title}`} value={source.collectionId ?? ''} onChange={event => void updateSource(source.id, { collectionId: event.target.value || null }).catch(saveError => setError(saveError.message))}><option value="">Uncollected</option>{activeCollections.map(collection => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select><a href={`/api/think/documents/${source.documentId}`} target="_blank" rel="noreferrer">Open document</a><button type="button" className="discover-text-button" onClick={() => void deleteSource(source.id)}>Remove</button></div>
                  </article>)}
                </div>
              </div>
              <form className="discover-report-form" onSubmit={event => void createReport(event)}><label>Research question<input value={reportQuestion} onChange={event => setReportQuestion(event.target.value)} maxLength={500} placeholder="What question should these excerpts support?" /></label><button className="discover-button" type="submit" disabled={busy || selectedSources.length === 0 || reportQuestion.trim().length < 2}>Create evidence report ({selectedSources.length})</button></form>
            </section>
          )}

          {section === 'research' && (
            <section aria-labelledby="discover-reports-title">
              <div className="discover-section-heading"><div><p className="discover-kicker">RESEARCH WORKSPACE</p><h2 id="discover-reports-title">Evidence reports</h2></div></div>
              <p className="discover-muted">Reports are generated immediately from selected saved excerpts. They are evidence compilations, not background research tasks or verified conclusions.</p>
              <div className="discover-report-layout">
                <div className="discover-report-list">{reports.length === 0 ? <div className="discover-empty discover-empty-small"><strong>No reports yet</strong><small>Select evidence in Research library to compile a report.</small></div> : reports.map(report => <button className={activeReport?.id === report.id ? 'is-active' : ''} type="button" key={report.id} onClick={() => void openReport(report.id)}><strong>{report.title}</strong><small>{new Date(report.createdAt).toLocaleString()}</small></button>)}</div>
                <article className="discover-report-view">{activeReport ? <><div className="discover-saved-heading"><h3>{activeReport.title}</h3><a href={`/api/discover/research/${activeReport.id}?download=1`}>Download Markdown</a></div><pre>{activeReport.markdown ?? 'Loading report…'}</pre></> : <div className="discover-empty"><strong>Select a report</strong><small>Saved reports retain evidence excerpts and document character locations.</small></div>}</article>
              </div>
            </section>
          )}

          {section === 'history' && (
            <section aria-labelledby="discover-history-title">
              <div className="discover-section-heading"><div><p className="discover-kicker">RECENT ACTIVITY</p><h2 id="discover-history-title">Search history</h2></div></div>
              <div className="discover-history-list">{history.length === 0 ? <div className="discover-empty"><strong>No searches yet</strong><small>Queries you run over your private document library will appear here.</small></div> : history.map(item => <button type="button" key={item.id} onClick={() => { setQuery(item.query); setExactPhrase(item.exactPhrase); setSection('search'); void runSearch(undefined, item.query, item.exactPhrase); }}><span><strong>{item.query}</strong><small>{item.resultCount} result{item.resultCount === 1 ? '' : 's'} · {new Date(item.createdAt).toLocaleString()}</small></span><span aria-hidden="true">↗</span></button>)}</div>
            </section>
          )}

          {section === 'settings' && (
            <section aria-labelledby="discover-settings-title">
              <div className="discover-section-heading"><div><p className="discover-kicker">PROVIDER STATUS</p><h2 id="discover-settings-title">Research capabilities</h2></div></div>
              <div className="discover-provider-list">{providers && Object.entries(providers).map(([name, provider]) => <article key={name}><span className={`discover-provider-indicator${provider.configured ? ' is-ready' : ''}`} /><div><strong>{providerLabel(name)}</strong><small>{provider.description}</small></div><b>{provider.configured ? 'READY' : 'UNAVAILABLE'}</b></article>)}</div>
              <p className="discover-muted">Provider credentials stay on the server. DISCOVER does not fetch arbitrary URLs or send documents to an AI service automatically. Document content is sent to THINK only when you explicitly submit a question with selected documents.</p>
            </section>
          )}
        </div>
      </div>

      <footer className="discover-footer"><span>Evidence first. Interpretations clearly labeled.</span><span><a href="/think">THINK</a><a href="/create">CREATE</a><a href="/build">BUILD</a></span></footer>
    </main>
  );
}

function processThinkEvent(block: string, onText: (text: string) => void, onCitation: (citation: Citation) => void, onError: (message: string) => void) {
  const event = block.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim();
  const raw = block.split('\n').find(line => line.startsWith('data:'))?.slice(5).trim();
  if (!event || !raw) return;
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw) as Record<string, unknown>; }
  catch { return; }
  if (event === 'delta' && typeof data.text === 'string') onText(data.text);
  if (event === 'citation' && typeof data.url === 'string' && typeof data.title === 'string' && safeHttpLink(data.url)) onCitation({ url: data.url, title: data.title });
  if (event === 'error' && typeof data.message === 'string') onError(data.message);
}

function safeHttpLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function providerLabel(key: string) {
  return ({
    localDocuments: 'Private document search',
    think: 'THINK AI analysis',
    webSearch: 'Public web search',
    news: 'News search',
    academic: 'Academic search',
  } as Record<string, string>)[key] ?? key;
}

async function readError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? `Request failed (${response.status}).`;
}
