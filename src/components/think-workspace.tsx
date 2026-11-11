'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type AgentId = 'general' | 'research' | 'coding' | 'study' | 'writing' | 'analysis';
type Conversation = { _id?: string; id: string; title: string; model?: string; modelId?: string; agent: AgentId; pinned: boolean; archived: boolean; lastMessagePreview: string; updatedAt: string };
type Citation = { url: string; title: string };
type ToolExecution = { name: string; input: string; outcome: string; summary: string; createdAt: string };
type Message = { id: string; role: 'user' | 'assistant'; content: string; model: string; agent: AgentId; documentIds: string[]; citations: Citation[]; toolExecutions: ToolExecution[]; status: 'complete' | 'streaming' | 'failed' | 'interrupted'; createdAt: string };
type Document = { id: string; name: string; mimeType: string; size: number; pageCount?: number; createdAt: string };
type Settings = { provider: { id: 'openai'; name: string; configured: boolean; models: string[]; webSearchConfigured: boolean }; preference: { provider: 'openai'; model: string; agent: AgentId } };
type SearchResult = { id: string; conversationId: string; title: string; excerpt?: string; kind: 'conversation' | 'message' };
type ServerError = { error?: string };

const AGENTS: Array<{ id: AgentId; name: string; desc: string }> = [
  { id: 'general', name: 'General assistant', desc: 'Everyday thinking' },
  { id: 'research', name: 'Research agent', desc: 'Sources and current context' },
  { id: 'coding', name: 'Coding agent', desc: 'Code and debugging' },
  { id: 'study', name: 'Study agent', desc: 'Learn step by step' },
  { id: 'writing', name: 'Writing agent', desc: 'Draft and refine' },
  { id: 'analysis', name: 'Data analysis agent', desc: 'Evidence and calculations' },
];

async function readError(response: Response) {
  const body = await response.json().catch(() => ({})) as ServerError;
  return body.error ?? `Request failed (${response.status}).`;
}

function safeLink(value: string) {
  try {
    const parsed = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

function inlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<]+)/g;
  const nodes: ReactNode[] = [];
  let previous = 0;
  let index = 0;
  for (const match of value.matchAll(pattern)) {
    const text = match[0];
    const start = match.index ?? 0;
    if (start > previous) nodes.push(value.slice(previous, start));
    let node: ReactNode = text;
    if (text.startsWith('**')) node = <strong key={`${keyPrefix}-${index}`}>{text.slice(2, -2)}</strong>;
    else if (text.startsWith('`')) node = <code className="think-inline-code" key={`${keyPrefix}-${index}`}>{text.slice(1, -1)}</code>;
    else if (text.startsWith('*')) node = <em key={`${keyPrefix}-${index}`}>{text.slice(1, -1)}</em>;
    else {
      const markdownLink = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(text);
      const label = markdownLink?.[1] ?? text;
      const href = safeLink(markdownLink?.[2] ?? text);
      if (href) node = <a href={href} rel="noopener noreferrer" target="_blank" key={`${keyPrefix}-${index}`}>{label}</a>;
    }
    nodes.push(node);
    previous = start + text.length;
    index += 1;
  }
  if (previous < value.length) nodes.push(value.slice(previous));
  return nodes;
}

function markdownTableCells(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function ThinkMarkdown({ value }: { value: string }) {
  const lines = value.split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre className="think-code-block" key={`code-${index}`}><code data-language={language || undefined}>{code.join('\n')}</code></pre>);
      continue;
    }
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const headers = markdownTableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(markdownTableCells(lines[index++]));
      blocks.push(<div className="think-table-wrap" key={`table-${index}`}><table><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{inlineMarkdown(cell, `th-${index}-${cellIndex}`)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{inlineMarkdown(row[cellIndex] ?? '', `td-${index}-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      const depth = line.match(/^#+/)?.[0].length ?? 2;
      const text = line.replace(/^#{1,4}\s/, '');
      const Tag = `h${Math.min(4, depth + 1)}` as 'h2' | 'h3' | 'h4';
      blocks.push(<Tag key={`heading-${index}`}>{inlineMarkdown(text, `h-${index}`)}</Tag>);
      index += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={`quote-${index}`}>{quote.map((item, quoteIndex) => <p key={quoteIndex}>{inlineMarkdown(item, `q-${index}-${quoteIndex}`)}</p>)}</blockquote>);
      continue;
    }
    if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      const ordered = /^\s*\d+\.\s/.test(line);
      const items: string[] = [];
      const marker = ordered ? /^\s*\d+\.\s/ : /^\s*[-*+]\s/;
      while (index < lines.length && marker.test(lines[index])) items.push(lines[index++].replace(marker, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item, `li-${index}-${itemIndex}`)}</li>)}</List>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !lines[index].startsWith('```') && !/^#{1,4}\s/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`p-${index}`}>{paragraph.map((part, partIndex) => <span key={partIndex}>{partIndex > 0 && <br />}{inlineMarkdown(part, `p-${index}-${partIndex}`)}</span>)}</p>);
  }
  return <div className="think-markdown">{blocks}</div>;
}

export function ThinkWorkspace({ displayName }: { displayName: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [archived, setArchived] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('gpt-4.1-mini');
  const [agent, setAgent] = useState<AgentId>('general');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const selectedConversation = conversations.find(item => item.id === conversationId || item._id === conversationId) ?? null;
  const currentAgent = AGENTS.find(item => item.id === agent) ?? AGENTS[0];
  const activeDocuments = documents.filter(document => selectedDocumentIds.includes(document.id));
  const visibleConversations = useMemo(() => conversations.filter(item => item.archived === archived), [conversations, archived]);

  const refreshConversations = useCallback(async (archivedFilter = false) => {
    const response = await fetch(`/api/think/conversations?archived=${archivedFilter ? '1' : '0'}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await readError(response));
    const body = await response.json() as { conversations: Conversation[] };
    setConversations(previous => {
      const other = previous.filter(item => item.archived !== archivedFilter);
      return [...other, ...body.conversations];
    });
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [settingsResponse, conversationResponse, documentResponse] = await Promise.all([
          fetch('/api/think/settings', { cache: 'no-store' }),
          fetch('/api/think/conversations', { cache: 'no-store' }),
          fetch('/api/think/documents', { cache: 'no-store' }),
        ]);
        if (!settingsResponse.ok) throw new Error(await readError(settingsResponse));
        if (!conversationResponse.ok) throw new Error(await readError(conversationResponse));
        if (!documentResponse.ok) throw new Error(await readError(documentResponse));
        const [nextSettings, conversationBody, documentBody] = await Promise.all([
          settingsResponse.json() as Promise<Settings>,
          conversationResponse.json() as Promise<{ conversations: Conversation[] }>,
          documentResponse.json() as Promise<{ documents: Document[] }>,
        ]);
        if (!active) return;
        setSettings(nextSettings);
        setConversations(conversationBody.conversations);
        setDocuments(documentBody.documents);
        setModel(nextSettings.preference.model);
        setAgent(nextSettings.preference.agent);
        if (conversationBody.conversations.length) setConversationId(conversationBody.conversations[0].id ?? conversationBody.conversations[0]._id ?? null);
      } catch (loadError) { if (active) setError(loadError instanceof Error ? loadError.message : 'THINK could not load.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; streamAbortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    let active = true;
    setBusy(true);
    setOlderCursor(null);
    setHasOlderMessages(false);
    setError('');
    setSelectedDocumentIds([]);
    (async () => {
      try {
        const [conversationResponse, messagesResponse] = await Promise.all([
          fetch(`/api/think/conversations/${conversationId}`, { cache: 'no-store' }),
          fetch(`/api/think/conversations/${conversationId}/messages`, { cache: 'no-store' }),
        ]);
        if (!conversationResponse.ok) throw new Error(await readError(conversationResponse));
        if (!messagesResponse.ok) throw new Error(await readError(messagesResponse));
        const conversationBody = await conversationResponse.json() as { conversation: Conversation };
        const messageBody = await messagesResponse.json() as { messages: Message[]; hasMore: boolean; nextCursor: string | null };
        if (!active) return;
        setMessages(messageBody.messages);
        setHasOlderMessages(messageBody.hasMore);
        setOlderCursor(messageBody.nextCursor);
        setModel(conversationBody.conversation.model ?? conversationBody.conversation.modelId ?? model);
        setAgent(conversationBody.conversation.agent);
      } catch (loadError) { if (active) setError(loadError instanceof Error ? loadError.message : 'Conversation could not load.'); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  // The model state is intentionally not a dependency; selection follows the chosen conversation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: streaming ? 'smooth' : 'instant' });
  }, [messages, streaming]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/think/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal })
        .then(async response => response.ok ? response.json() as Promise<{ results: SearchResult[] }> : Promise.reject(new Error(await readError(response))))
        .then(body => setResults(body.results)).catch(() => undefined);
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    if (loading) return;
    void refreshConversations(archived).catch(refreshError => setError(refreshError instanceof Error ? refreshError.message : 'Conversation list could not load.'));
  }, [archived, loading, refreshConversations]);

  async function createConversation() {
    setError('');
    const response = await fetch('/api/think/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, agent }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const body = await response.json() as { conversation: Conversation };
    const next = { ...body.conversation, id: body.conversation.id ?? body.conversation._id ?? '' };
    setConversations(previous => [next, ...previous.filter(item => item.id !== next.id)]);
    setConversationId(next.id);
    setMobileChatOpen(true);
    setMessages([]);
    return next.id;
  }

  async function persistPreference(nextModel = model, nextAgent = agent) {
    if (!settings) return;
    const response = await fetch('/api/think/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: nextModel, agent: nextAgent }) });
    if (!response.ok) throw new Error(await readError(response));
    const body = await response.json() as { preference: Settings['preference'] };
    setSettings(previous => previous ? { ...previous, preference: body.preference } : previous);
  }

  async function selectModel(value: string) {
    setModel(value);
    try {
      await persistPreference(value, agent);
      if (conversationId) await updateConversation({ model: value });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Model choice could not be saved.'); }
  }

  async function selectAgent(value: AgentId) {
    setAgent(value);
    try {
      await persistPreference(model, value);
      if (conversationId) await updateConversation({ agent: value });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Agent choice could not be saved.'); }
  }

  async function updateConversation(patch: Record<string, unknown>) {
    if (!conversationId) return;
    const response = await fetch(`/api/think/conversations/${conversationId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (!response.ok) throw new Error(await readError(response));
    const body = await response.json() as { conversation: Conversation };
    setConversations(previous => previous.map(item => item.id === conversationId ? { ...item, ...body.conversation, id: conversationId, model: body.conversation.modelId ?? item.model } : item));
  }

  async function applyEventBlock(block: string, mode: string) {
    const eventLine = block.split('\n').find(line => line.startsWith('event:'));
    const dataLine = block.split('\n').find(line => line.startsWith('data:'));
    if (!eventLine || !dataLine) return;
    const event = eventLine.slice(6).trim();
    const data = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
    if (event === 'meta') {
      const incomingUser = data.userMessage as Message | null;
      const assistantId = String(data.assistantMessageId);
      setMessages(previous => {
        const existing = previous.some(message => message.id === assistantId);
        const base = incomingUser && !previous.some(message => message.id === incomingUser.id) ? [...previous, incomingUser] : previous;
        if (existing) return base.map(message => message.id === assistantId ? { ...message, content: mode === 'continue' ? message.content : '', status: 'streaming', citations: [], toolExecutions: [] } : message);
        return [...base, { id: assistantId, role: 'assistant', content: '', model, agent, documentIds: [], citations: [], toolExecutions: [], status: 'streaming', createdAt: new Date().toISOString() }];
      });
    } else if (event === 'delta' && typeof data.text === 'string') {
      const text = data.text;
      setMessages(previous => previous.map((message, index) => index === previous.length - 1 ? { ...message, content: message.content + text } : message));
    } else if (event === 'citation') {
      const citation = data as unknown as Citation;
      setMessages(previous => previous.map((message, index) => index === previous.length - 1 && !message.citations.some(item => item.url === citation.url) ? { ...message, citations: [...message.citations, citation] } : message));
    } else if (event === 'tool') {
      if (data.status === 'started') setNotice('Searching public sources…');
      else setNotice('Source search complete.');
    } else if (event === 'done') {
      setMessages(previous => previous.map(message => message.id === data.messageId ? { ...message, status: 'complete' } : message));
    } else if (event === 'error') {
      const message = typeof data.message === 'string' ? data.message : 'The response could not be completed.';
      setError(message);
      setMessages(previous => previous.map((item, index) => index === previous.length - 1 ? { ...item, status: 'failed' } : item));
    }
  }

  async function streamMessage(content: string, mode: 'send' | 'regenerate' | 'continue' = 'send', messageId?: string) {
    let activeConversationId = conversationId;
    if (!activeConversationId) activeConversationId = await createConversation();
    setError('');
    setNotice('');
    setStreaming(true);
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    const response = await fetch(`/api/think/conversations/${activeConversationId}/messages`, {
      method: 'POST', signal: abortController.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, model, agent, documentIds: mode === 'send' ? selectedDocumentIds : undefined, mode, messageId }),
    }).catch(catchError => { throw catchError; });
    if (!response.ok) {
      setStreaming(false);
      throw new Error(await readError(response));
    }
    if (!response.body) { setStreaming(false); throw new Error('The response stream was empty.'); }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          await applyEventBlock(block, mode);
          boundary = buffer.indexOf('\n\n');
        }
      }
      if (buffer.trim()) await applyEventBlock(buffer, mode);
      await refreshConversations(archived);
    } catch (streamError) {
      if (streamError instanceof DOMException && streamError.name === 'AbortError') {
        setMessages(previous => previous.map((message, index) => index === previous.length - 1 ? { ...message, status: 'interrupted' } : message));
      } else setError(streamError instanceof Error ? streamError.message : 'The response stream was interrupted.');
    } finally {
      reader.releaseLock();
      streamAbortRef.current = null;
      setStreaming(false);
      setNotice('');
      textareaRef.current?.focus();
    }
  }

  async function send() {
    if (streaming || (!input.trim() && !selectedDocumentIds.length)) return;
    const content = input.trim();
    setInput('');
    setSelectedDocumentIds([]);
    setBusy(true);
    try { await streamMessage(content); }
    catch (sendError) { setError(sendError instanceof Error ? sendError.message : 'The message could not be sent.'); setInput(content); }
    finally { setBusy(false); }
  }

  async function createNew() {
    setError('');
    try { await createConversation(); }
    catch (createError) { setError(createError instanceof Error ? createError.message : 'Conversation could not be created.'); }
  }

  async function uploadDocument(file?: File) {
    if (!file) return;
    setUploading(true);
    setError('');
    const form = new FormData();
    form.set('file', file);
    try {
      const response = await fetch('/api/think/documents', { method: 'POST', body: form });
      if (!response.ok) throw new Error(await readError(response));
      const body = await response.json() as { document: Document };
      setDocuments(previous => [body.document, ...previous.filter(document => document.id !== body.document.id)]);
      setSelectedDocumentIds(previous => previous.includes(body.document.id) ? previous : [...previous, body.document.id].slice(0, 5));
      setNotice('Document is ready for this conversation.');
      window.setTimeout(() => setNotice(''), 3500);
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'Document upload failed.'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function loadOlderMessages() {
    if (!conversationId || !olderCursor || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/think/conversations/${conversationId}/messages?before=${encodeURIComponent(olderCursor)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await readError(response));
      const body = await response.json() as { messages: Message[]; hasMore: boolean; nextCursor: string | null };
      setMessages(previous => [...body.messages, ...previous]);
      setHasOlderMessages(body.hasMore);
      setOlderCursor(body.nextCursor);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Earlier messages could not load.'); }
    finally { setBusy(false); }
  }

  async function deleteDocument(document: Document) {
    const response = await fetch(`/api/think/documents/${document.id}`, { method: 'DELETE' });
    if (!response.ok) { setError(await readError(response)); return; }
    setDocuments(previous => previous.filter(item => item.id !== document.id));
    setSelectedDocumentIds(previous => previous.filter(id => id !== document.id));
  }

  async function togglePin(item: Conversation) {
    const response = await fetch(`/api/think/conversations/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !item.pinned }) });
    if (!response.ok) { setError(await readError(response)); return; }
    await refreshConversations(archived);
  }

  async function toggleArchive(item: Conversation) {
    const response = await fetch(`/api/think/conversations/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !item.archived }) });
    if (!response.ok) { setError(await readError(response)); return; }
    setConversations(previous => previous.filter(conversation => conversation.id !== item.id));
    if (conversationId === item.id) setConversationId(null);
    await refreshConversations(!item.archived);
  }

  async function rename(item: Conversation) {
    const title = window.prompt('Conversation name', item.title)?.trim();
    if (!title || title === item.title) return;
    const response = await fetch(`/api/think/conversations/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    if (!response.ok) { setError(await readError(response)); return; }
    setConversations(previous => previous.map(conversation => conversation.id === item.id ? { ...conversation, title } : conversation));
  }

  async function removeConversation(item: Conversation) {
    if (!window.confirm(`Delete “${item.title}” and its messages?`)) return;
    const response = await fetch(`/api/think/conversations/${item.id}`, { method: 'DELETE' });
    if (!response.ok) { setError(await readError(response)); return; }
    setConversations(previous => previous.filter(conversation => conversation.id !== item.id));
    if (conversationId === item.id) setConversationId(null);
  }

  async function saveEditedPrompt(message: Message) {
    const response = await fetch(`/api/think/messages/${message.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: editingContent }) });
    if (!response.ok) { setError(await readError(response)); return; }
    const body = await response.json() as { assistantMessageId: string };
    setMessages(previous => previous.map(item => item.id === message.id ? { ...item, content: editingContent } : item).filter(item => item.id !== body.assistantMessageId));
    setEditingId(null);
    try { await streamMessage('', 'regenerate', body.assistantMessageId); }
    catch (streamError) { setError(streamError instanceof Error ? streamError.message : 'The edited prompt could not be regenerated.'); }
  }

  async function runMessageAction(mode: 'regenerate' | 'continue', messageId: string) {
    try { await streamMessage('', mode, messageId); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'The response could not be completed.'); }
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  }

  return (
    <main className={`think-workspace${mobileChatOpen ? ' think-mobile-chat-open' : ''}`}>
      <aside className={`think-sidebar${mobileChatOpen ? ' think-sidebar-hidden' : ''}`} aria-label="THINK conversations">
        <div className="think-side-brand"><span className="think-side-mark">N</span><div><strong>THINK</strong><small>INTELLIGENCE CENTER</small></div><span className="think-online-dot" title="Private workspace" /></div>
        <button className="think-new-button" type="button" onClick={() => void createNew()}><span>＋</span> New conversation <kbd>⌘ N</kbd></button>
        <label className="think-side-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your conversations" aria-label="Search conversations" /><kbd>⌘ K</kbd></label>
        {query.trim().length >= 2 && <div className="think-search-results" aria-live="polite">{results.length ? results.map(result => <button type="button" key={`${result.kind}-${result.id}`} onClick={() => { setConversationId(result.conversationId); setQuery(''); setMobileChatOpen(true); }}><span>{result.kind === 'message' ? '↳' : '✦'}</span><span><strong>{result.title}</strong><small>{result.excerpt ?? 'Conversation'}</small></span></button>) : <p>No matches found.</p>}</div>}
        <div className="think-sidebar-section"><span>YOUR THINKING</span><button type="button" className={archived ? '' : 'active'} onClick={() => setArchived(false)}>Recent</button><button type="button" className={archived ? 'active' : ''} onClick={() => setArchived(true)}>Archived</button></div>
        <div className="think-conversation-list">
          {loading ? <div className="think-side-loading"><i /> Loading conversations…</div> : visibleConversations.length ? visibleConversations.map(item => <div className={`think-conversation-item${conversationId === item.id ? ' selected' : ''}`} key={item.id}>
            <button className="think-conversation-select" type="button" onClick={() => { setConversationId(item.id); setMobileChatOpen(true); }}><span className="think-conversation-icon">✳</span><span><strong>{item.title}</strong><small>{item.lastMessagePreview || 'Start with a question'}</small></span></button>
            <details className="think-conversation-menu"><summary aria-label={`Actions for ${item.title}`}>···</summary><div><button type="button" onClick={() => void rename(item)}>Rename</button><button type="button" onClick={() => void togglePin(item)}>{item.pinned ? 'Unpin' : 'Pin'}</button><button type="button" onClick={() => void toggleArchive(item)}>{item.archived ? 'Restore' : 'Archive'}</button><button type="button" className="destructive" onClick={() => void removeConversation(item)}>Delete</button></div></details>
          </div>) : <div className="think-side-empty"><span>◌</span><strong>{archived ? 'Nothing archived' : 'A fresh page'}</strong><p>{archived ? 'Archived chats will live here.' : 'Start a conversation and your history will stay here.'}</p></div>}
        </div>
        <div className="think-sidebar-bottom"><div className="think-user-avatar">{displayName.slice(0, 1).toUpperCase()}</div><span><strong>{displayName}</strong><small>Personal intelligence space</small></span><span className="think-private-lock" title="Private workspace">⌑</span></div>
      </aside>

      <section className="think-main" aria-label="AI conversation">
        <header className="think-header">
          <div className="think-header-title"><button className="think-mobile-back" type="button" onClick={() => setMobileChatOpen(false)} aria-label="Back to conversations">←</button><span className="think-header-glyph">✳</span><div><span className="think-eyebrow">YOUR INTELLIGENCE CENTER</span><h1>{selectedConversation?.title ?? 'Think clearly.'}</h1></div></div>
          <div className="think-header-controls"><label><span>MODEL</span><select value={model} onChange={event => void selectModel(event.target.value)} aria-label="AI model"><option value={model}>{model} · OpenAI</option>{(settings?.provider.models ?? []).filter(item => item !== model).map(item => <option key={item} value={item}>{item} · OpenAI</option>)}</select></label><label><span>AGENT</span><select value={agent} onChange={event => void selectAgent(event.target.value as AgentId)} aria-label="AI agent">{AGENTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        </header>
        {error && <div className="think-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
        {!settings?.provider.configured && <div className="think-provider-banner"><span>◉</span><div><strong>Connect your AI provider</strong><p>Add <code>OPENAI_API_KEY</code> to the server environment to enable live responses. Credentials never reach the browser.</p></div><span className="think-provider-state">NOT CONFIGURED</span></div>}

        <div className="think-messages" ref={scrollRef} aria-live="polite">
          {hasOlderMessages && <button className="think-load-older" type="button" disabled={busy} onClick={() => void loadOlderMessages()}>Load earlier messages</button>}
          {messages.length === 0 ? <div className="think-welcome"><div className="think-orbit"><i /><i /><i /><span>✳</span></div><p className="think-eyebrow">A CLEARER WAY FORWARD</p><h2>{selectedConversation ? 'Pick up where you left off.' : 'What’s on your mind?'}</h2><p className="think-welcome-copy">A useful answer starts with a good question. Explore an idea, work through a problem, or bring a document into focus.</p><div className="think-prompt-cards">{[
            ['01', 'Explore an idea', 'Help me think through a decision…'], ['02', 'Learn something', 'Explain a new concept simply…'], ['03', 'Make a first draft', 'Help me get a rough draft started…'],
          ].map(([number, title, prompt]) => <button type="button" key={number} onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}><small>{number}</small><strong>{title}</strong><span>{prompt}</span><i>↗</i></button>)}</div></div> : messages.map((message, index) => <article className={`think-message think-message-${message.role}`} key={message.id}>
            <div className="think-message-avatar">{message.role === 'assistant' ? 'N' : displayName.slice(0, 1).toUpperCase()}</div>
            <div className="think-message-body"><div className="think-message-meta"><strong>{message.role === 'assistant' ? 'NEXORA' : 'YOU'}</strong><span>{message.role === 'assistant' ? AGENTS.find(item => item.id === message.agent)?.name ?? 'Assistant' : 'Your prompt'}</span><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
              {editingId === message.id ? <div className="think-edit-prompt"><textarea value={editingContent} onChange={event => setEditingContent(event.target.value)} aria-label="Edit your prompt" /><div><button type="button" onClick={() => setEditingId(null)}>Cancel</button><button type="button" onClick={() => void saveEditedPrompt(message)}>Save & regenerate</button></div></div> : <ThinkMarkdown value={message.content || (message.status === 'streaming' ? '' : message.status === 'failed' ? 'The response could not be completed.' : '')} />}
              {message.role === 'assistant' && message.status === 'streaming' && <span className="think-typing-cursor" aria-label="Generating response" />}
              {message.status === 'failed' && <span className="think-message-state">Response interrupted. Retry to continue.</span>}
              {message.documentIds.length > 0 && <div className="think-message-documents">{message.documentIds.map(id => <span key={id}>▤ {documents.find(document => document.id === id)?.name ?? 'Attached document'}</span>)}</div>}
              {message.citations.length > 0 && <div className="think-citations"><strong>Sources</strong>{message.citations.map((citation, citeIndex) => <a key={`${citation.url}-${citeIndex}`} href={safeLink(citation.url) ?? undefined} rel="noopener noreferrer" target="_blank"><span>{citeIndex + 1}</span>{citation.title || citation.url}<i>↗</i></a>)}</div>}
              {message.toolExecutions.length > 0 && <details className="think-tool-log"><summary>Research activity · {message.toolExecutions.length}</summary>{message.toolExecutions.map((tool, toolIndex) => <p key={`${tool.name}-${toolIndex}`}><span>✓</span> {tool.summary}</p>)}</details>}
              {message.role === 'assistant' && <div className="think-message-actions"><button type="button" onClick={() => void navigator.clipboard.writeText(message.content).then(() => { setNotice('Copied to clipboard.'); window.setTimeout(() => setNotice(''), 2200); }).catch(() => setError('Clipboard access is unavailable.'))}>Copy</button>{index === messages.length - 1 && message.status !== 'streaming' && <><button type="button" onClick={() => void runMessageAction('regenerate', message.id)}>Regenerate</button><button type="button" onClick={() => void runMessageAction('continue', message.id)}>Continue</button></>}</div>}
              {message.role === 'user' && message.status === 'complete' && index === messages.length - 2 && !streaming && <div className="think-message-actions"><button type="button" onClick={() => { setEditingId(message.id); setEditingContent(message.content); }}>Edit prompt</button></div>}
            </div>
          </article>)}
          {streaming && messages.at(-1)?.role !== 'assistant' && <div className="think-streaming-state"><span className="think-header-glyph">✳</span><i /><i /><i /><span>{notice || `${currentAgent.name} is thinking`}</span></div>}
        </div>

        <div className="think-compose-area">
          {notice && <div className="think-notice" role="status">{notice}</div>}
          {activeDocuments.length > 0 && <div className="think-selected-docs">{activeDocuments.map(document => <span key={document.id}><i>▤</i>{document.name}<button type="button" onClick={() => setSelectedDocumentIds(previous => previous.filter(id => id !== document.id))} aria-label={`Remove ${document.name}`}>×</button></span>)}</div>}
          <form className="think-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
            <div className="think-compose-tools"><button className="think-attach-button" type="button" onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach a PDF, DOCX or TXT" aria-label="Attach a document">＋</button><input ref={fileRef} type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={event => void uploadDocument(event.target.files?.[0])} />{documents.length > 0 && <details className="think-doc-picker"><summary title="Attach a saved document">▤</summary><div>{documents.map(document => <label key={document.id}><input type="checkbox" checked={selectedDocumentIds.includes(document.id)} onChange={event => setSelectedDocumentIds(previous => event.target.checked ? [...previous, document.id].slice(0, 5) : previous.filter(id => id !== document.id))} /><span>{document.name}<small>{document.mimeType.split('/').pop()}</small></span><button type="button" onClick={() => void deleteDocument(document)} aria-label={`Delete ${document.name}`}>×</button></label>)}</div></details>}<span className="think-agent-chip">{currentAgent.name}</span></div>
            <textarea ref={textareaRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={onComposerKeyDown} placeholder={activeDocuments.length ? 'Ask a question about your document…' : 'Ask anything, explore an idea, or start a draft…'} aria-label="Message NEXORA THINK" rows={2} disabled={streaming} />
            <div className="think-composer-footer"><span>{uploading ? 'Reading and securing document…' : settings?.provider.webSearchConfigured && agent === 'research' ? 'Research agent can search public web sources' : 'Your conversations are private to your account'}</span><button className="think-send-button" type={streaming ? 'button' : 'submit'} disabled={!streaming && (loading || busy || (!input.trim() && !selectedDocumentIds.length))} onClick={streaming ? () => streamAbortRef.current?.abort() : undefined} title={streaming ? 'Stop response' : 'Send message'}>{streaming ? <span className="think-send-stop">■</span> : '↑'}</button></div>
          </form>
          <p className="think-privacy-note">{activeDocuments.length ? 'Attached documents are sent to OpenAI when you submit this message.' : 'AI can make mistakes. Review important information and source references.'}</p>
        </div>
      </section>
    </main>
  );
}
