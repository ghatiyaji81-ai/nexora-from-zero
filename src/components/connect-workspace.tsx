'use client';

import Link from 'next/link';
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogoutButton } from '@/components/logout-button';
import { ThemeToggle } from '@/components/theme-toggle';

type ConnectUser = { id: string; name: string; email: string };
type Contact = { id: string; name: string; email: string; avatarUrl?: string; online: boolean; lastSeenAt?: string };
type Conversation = {
  id: string; type: 'direct' | 'group'; name: string; description: string; avatarFileId?: string;
  members: Array<{ id: string; name: string; avatarUrl?: string; online: boolean }>;
  memberCount: number; adminIds: string[]; allowMemberInvites: boolean; allowMemberEditInfo: boolean;
  lastMessageAt?: string; lastMessageText: string; lastMessageSenderId?: string; unreadCount: number;
};
type Attachment = { fileId: string; fileName: string; contentType: string; size: number; kind: 'image' | 'video' | 'document' | 'audio' };
type ChatMessage = {
  id: string; conversationId: string; senderId: string; body: string; attachments: Attachment[];
  replyTo?: string; editedAt?: string; deletedForEveryoneAt?: string; createdAt: string;
  deliveredTo: Array<{ userId: string; at: string }>; readBy: Array<{ userId: string; at: string }>;
  reactions: Array<{ userId: string; emoji: string; at: string }>;
};
type MediaItem = Attachment & { sentAt: string; senderId: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Connect is temporarily unavailable.');
  return result as T;
}

function initials(value: string) {
  return value.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase();
}

function timeLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Avatar({ name, online, image }: { name: string; online?: boolean; image?: string }) {
  return <span className="connect-avatar-wrap">{image ? <img className="connect-avatar" src={image} alt="" /> : <span className="connect-avatar">{initials(name)}</span>}{online && <i className="connect-online-dot" aria-label="Online" />}</span>;
}

function MessageStatus({ message, userId }: { message: ChatMessage; userId: string }) {
  if (message.readBy.some(receipt => receipt.userId !== userId)) return <span className="connect-receipt read" title="Read">✓✓</span>;
  if (message.deliveredTo.some(receipt => receipt.userId !== userId)) return <span className="connect-receipt" title="Delivered">✓✓</span>;
  return <span className="connect-receipt" title="Sent">✓</span>;
}

function AttachmentView({ item }: { item: Attachment }) {
  const href = `/api/connect/attachments/${item.fileId}`;
  if (item.kind === 'image') return <a className="connect-image-attachment" href={href} target="_blank" rel="noreferrer"><img src={href} alt={item.fileName} loading="lazy" /></a>;
  if (item.kind === 'video') return <video className="connect-video-attachment" src={href} controls preload="metadata" />;
  if (item.kind === 'audio') return <audio className="connect-audio-attachment" src={href} controls preload="metadata" />;
  return <a className="connect-file-attachment" href={href} target="_blank" rel="noreferrer"><span>↧</span><span><strong>{item.fileName}</strong><small>{Math.max(1, Math.round(item.size / 1024))} KB · Document</small></span></a>;
}

function upload(file: File, conversationId: string, onProgress: (value: number) => void) {
  return new Promise<{ fileId: string; fileName: string; contentType: string; size: number; kind: Attachment['kind'] }>((resolve, reject) => {
    const form = new FormData();
    form.set('conversationId', conversationId);
    form.set('file', file, file.name);
    const request = new XMLHttpRequest();
    request.open('POST', '/api/connect/attachments');
    request.withCredentials = true;
    request.timeout = 120_000;
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onerror = () => reject(new Error('Upload failed. Check your connection and retry.'));
    request.ontimeout = () => reject(new Error('Upload timed out. You can retry the attachment.'));
    request.onload = () => {
      let result: { error?: string; fileId?: string; fileName?: string; contentType?: string; size?: number; kind?: Attachment['kind'] };
      try { result = JSON.parse(request.responseText || '{}') as typeof result; }
      catch { reject(new Error('Upload failed. The server returned an unreadable response.')); return; }
      if (request.status < 200 || request.status >= 300 || !result.fileId || !result.fileName || !result.contentType || !result.kind || result.size === undefined) {
        reject(new Error(result.error ?? 'Upload failed.'));
      } else resolve({ fileId: result.fileId, fileName: result.fileName, contentType: result.contentType, size: result.size, kind: result.kind });
    };
    request.send(form);
  });
}

export function ConnectWorkspace({ user }: { user: ConnectUser }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageLoading, setMessageLoading] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [edit, setEdit] = useState<ChatMessage | null>(null);
  const [reactionMenuId, setReactionMenuId] = useState('');
  const [files, setFiles] = useState<Array<{ file: File; uploaded?: Attachment; progress?: number }>>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ conversations: Array<{ id: string; type: string; title?: string; preview: string }>; messages: Array<{ id: string; conversationId: string; body: string; at: string }> } | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [gallery, setGallery] = useState<MediaItem[]>([]);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const typingActive = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const current = conversations.find(conversation => conversation.id === currentId) ?? null;
  const currentMessages = useMemo(() => messages.filter(message => !message.deletedForEveryoneAt), [messages]);
  const peer = current?.members[0];
  const isAdmin = current?.adminIds.includes(user.id) ?? false;

  useEffect(() => () => {
    if (recorder.current?.state === 'recording') {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    mediaStream.current?.getTracks().forEach(track => track.stop());
  }, []);

  const loadConversations = useCallback(async () => {
    const result = await api<{ conversations: Conversation[] }>('/api/connect/conversations');
    setConversations(result.conversations);
    setCurrentId(current => current || result.conversations[0]?.id || '');
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessageLoading(true);
    try {
      const result = await api<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/connect/conversations/${conversationId}/messages?limit=50`);
      setMessages(existing => {
        const older = existing.filter(message => message.conversationId === conversationId && result.messages[0] && message.createdAt < result.messages[0].createdAt);
        const merged = new Map([...older, ...result.messages].map(message => [message.id, message]));
        return [...merged.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      });
      setHasOlderMessages(result.hasMore);
      void api(`/api/connect/conversations/${conversationId}/read`, { method: 'POST', body: '{}' });
      void loadConversations();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this conversation.'); }
    finally { setMessageLoading(false); }
  }, [loadConversations]);

  async function loadOlderMessages() {
    if (!currentId || !messages.length || !hasOlderMessages || messageLoading) return;
    const oldest = messages[0];
    setMessageLoading(true);
    try {
      const result = await api<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/connect/conversations/${currentId}/messages?limit=50&beforeAt=${encodeURIComponent(oldest.createdAt)}&beforeId=${oldest.id}`);
      setMessages(current => [...result.messages, ...current]);
      setHasOlderMessages(result.hasMore);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load older messages.'); }
    finally { setMessageLoading(false); }
  }

  useEffect(() => {
    let active = true;
    void api<{ conversations: Conversation[] }>('/api/connect/conversations').then(result => {
      if (!active) return;
      setConversations(result.conversations);
      setCurrentId(result.conversations[0]?.id ?? '');
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load Connect.'); }).finally(() => { if (active) setLoading(false); });
    const heartbeat = () => {
      void api('/api/connect/presence', { method: 'POST', body: '{}' }).then(() => setOffline(false)).catch(() => setOffline(true));
      void loadConversations().catch(() => undefined);
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 35_000);
    const online = () => setOffline(false);
    const offlineEvent = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineEvent);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('online', online); window.removeEventListener('offline', offlineEvent); };
  }, []);

  useEffect(() => {
    if (!currentId) { setMessages([]); return; }
    setMessages([]);
    setHasOlderMessages(false);
    setReply(null);
    setEdit(null);
    void loadMessages(currentId);
    const events = new EventSource(`/api/connect/conversations/${currentId}/events`);
    events.onopen = () => { setOffline(false); void loadMessages(currentId); void loadConversations(); };
    events.onerror = () => setOffline(true);
    events.addEventListener('message', () => { void loadMessages(currentId); void loadConversations(); });
    events.addEventListener('refresh', () => { void loadMessages(currentId); void loadConversations(); });
    events.addEventListener('conversation', () => { void loadConversations(); });
    events.addEventListener('typing', event => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as { userId?: string; expiresAt?: string; removed?: boolean };
      if (!payload.userId || payload.userId === user.id) return;
      setTypingIds(ids => payload.removed ? ids.filter(id => id !== payload.userId) : [...new Set([...ids, payload.userId!])]);
      if (!payload.removed) window.setTimeout(() => setTypingIds(ids => ids.filter(id => id !== payload.userId)), 6000);
    });
    events.addEventListener('presence', event => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as { userId?: string; online: boolean };
      if (!payload.userId) return;
      setConversations(items => items.map(item => ({ ...item, members: item.members.map(member => member.id === payload.userId ? { ...member, online: payload.online } : member) })));
    });
    events.addEventListener('revoked', () => { events.close(); setCurrentId(''); setError('You no longer have access to that group.'); void loadConversations(); });
    return () => { events.close(); if (typingTimer.current) clearTimeout(typingTimer.current); typingActive.current = false; };
  }, [currentId, loadMessages, loadConversations, user.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, currentId]);

  useEffect(() => {
    if (!showContacts) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void api<{ contacts: Contact[] }>(`/api/connect/contacts?q=${encodeURIComponent(contactQuery)}`).then(result => { if (active) setContacts(result.contacts); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Contact search failed.'));
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [contactQuery, showContacts]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults(null); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      void api<NonNullable<typeof searchResults>>(`/api/connect/search?q=${encodeURIComponent(search.trim())}`).then(result => { if (active) setSearchResults(result); }).catch(() => undefined);
    }, 240);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);

  async function startDirect(contact: Contact) {
    try {
      const result = await api<{ conversationId: string }>('/api/connect/conversations/direct', { method: 'POST', body: JSON.stringify({ userId: contact.id }) });
      await loadConversations();
      setCurrentId(result.conversationId);
      setMobileChatOpen(true);
      setShowContacts(false);
      setSearch('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open conversation.'); }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupName.trim() || selectedMembers.length < 1) return;
    setCreatingGroup(true);
    try {
      const result = await api<{ conversationId: string }>('/api/connect/conversations', { method: 'POST', body: JSON.stringify({ name: groupName, memberIds: selectedMembers }) });
      await loadConversations();
      setCurrentId(result.conversationId);
      setMobileChatOpen(true);
      setShowContacts(false);
      setSelectedMembers([]);
      setGroupName('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create group.'); }
    finally { setCreatingGroup(false); }
  }

  async function changeTyping(value: string) {
    setDraft(value);
    if (!currentId) return;
    if (value.trim() && !typingActive.current) {
      typingActive.current = true;
      void api(`/api/connect/conversations/${currentId}/actions`, { method: 'POST', body: JSON.stringify({ action: 'typing', active: true }) }).catch(() => undefined);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingActive.current = false;
      void api(`/api/connect/conversations/${currentId}/actions`, { method: 'POST', body: JSON.stringify({ action: 'typing', active: false }) }).catch(() => undefined);
    }, 2500);
  }

  function chooseFiles(event: ChangeEvent<HTMLInputElement>, voice = false) {
    const selected = Array.from(event.target.files ?? []).map(file => ({ file }));
    if (selected.length) setFiles(current => [...current, ...selected].slice(0, 5));
    event.target.value = '';
    if (voice) setRecording(false);
  }

  async function removeQueuedFile(index: number) {
    const queued = files[index];
    if (!queued) return;
    if (queued.uploaded) {
      try { await api(`/api/connect/attachments/${queued.uploaded.fileId}`, { method: 'DELETE' }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove the uploaded file.'); return; }
    }
    setFiles(entries => entries.filter((_, currentIndex) => currentIndex !== index));
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!currentId || sending || (!draft.trim() && !files.length)) return;
    setSending(true);
    setError('');
    try {
      const uploaded: Attachment[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const item = files[index];
        if (item.uploaded) { uploaded.push(item.uploaded); continue; }
        setFiles(items => items.map((entry, i) => i === index ? { ...entry, progress: 0 } : entry));
        const result = await upload(item.file, currentId, progress => setFiles(items => items.map((entry, i) => i === index ? { ...entry, progress } : entry)));
        const attachment: Attachment = result;
        uploaded.push(attachment);
        setFiles(items => items.map((entry, i) => i === index ? { ...entry, uploaded: attachment, progress: 100 } : entry));
      }
      if (edit) {
        await api(`/api/connect/conversations/${currentId}/actions`, { method: 'POST', body: JSON.stringify({ action: 'edit', messageId: edit.id, body: draft }) });
      } else {
        await api(`/api/connect/conversations/${currentId}/messages`, { method: 'POST', body: JSON.stringify({ body: draft, replyTo: reply?.id, attachments: uploaded.map(item => item.fileId) }) });
      }
      setDraft(''); setFiles([]); setReply(null); setEdit(null);
      typingActive.current = false;
      await loadMessages(currentId);
      await loadConversations();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Message could not be sent.'); }
    finally { setSending(false); }
  }

  async function runMessageAction(message: ChatMessage, action: string, extra?: Record<string, unknown>) {
    if (!currentId) return;
    try {
      await api(`/api/connect/conversations/${currentId}/actions`, { method: 'POST', body: JSON.stringify({ action, messageId: message.id, ...extra }) });
      await loadMessages(currentId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Message action failed.'); }
  }

  async function openGallery() {
    if (!currentId) return;
    setShowGallery(true);
    try { const result = await api<{ media: MediaItem[] }>(`/api/connect/conversations/${currentId}/media`); setGallery(result.media); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Media gallery failed to load.'); }
  }

  async function openGroupInfo() {
    if (!currentId) return;
    setShowGroupInfo(true);
    try { const result = await api<{ contacts: Contact[] }>('/api/connect/contacts'); setContacts(result.contacts); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Members failed to load.'); }
  }

  async function updateGroup(change: Record<string, unknown>) {
    if (!currentId) return;
    try { await api(`/api/connect/conversations/${currentId}/members`, { method: 'POST', body: JSON.stringify(change) }); await loadConversations(); setShowGroupInfo(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Group update failed.'); }
  }

  async function uploadGroupAvatar(file: File) {
    if (!currentId) return;
    try { const image = await upload(file, currentId, () => undefined); await updateGroup({ action: 'settings', avatarFileId: image.fileId }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Group image upload failed.'); }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setError('Voice recording is not supported in this browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onstop = () => {
        const blob = new Blob(chunks, { type: instance.mimeType || 'audio/webm' });
        const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
        const voiceFile = new File([blob], `voice-message.${extension}`, { type: blob.type });
        setFiles(current => [...current, { file: voiceFile }].slice(0, 5));
        stream.getTracks().forEach(track => track.stop());
        mediaStream.current = null;
        setRecording(false);
      };
      recorder.current = instance;
      instance.start();
      setRecording(true);
    } catch { setError('Microphone permission was denied or the microphone is unavailable.'); }
  }

  function stopRecording() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  const visibleConversations = conversations.filter(conversation => `${conversation.name} ${conversation.lastMessageText}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="connect-app">
      <header className="connect-topbar">
        <div className="connect-brand"><Link href="/" aria-label="NEXORA overview">N</Link><span><strong>CONNECT</strong><small>Messages that move with you</small></span></div>
        <div className="connect-top-actions"><span className="connect-user-label">{user.name}</span><ThemeToggle /><LogoutButton /></div>
      </header>
      {offline && <div className="connect-offline" role="status">You’re offline. Messages will reconnect when your network is back.</div>}
      <div className="connect-layout">
        <aside className={`connect-sidebar${mobileChatOpen ? ' connect-sidebar-away' : ''}`}>
          <div className="connect-sidebar-heading"><div><p className="connect-eyebrow">YOUR SPACE</p><h1>Messages</h1></div><button className="connect-new-button" type="button" onClick={() => { setShowContacts(true); setSearch(''); }} aria-label="New conversation or group">＋</button></div>
          <label className="connect-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search messages and people" /><kbd>↵</kbd></label>
          {searchResults && <div className="connect-search-results"><small>SEARCH RESULTS</small>{searchResults.messages.slice(0, 4).map(result => <button key={result.id} type="button" onClick={() => { setCurrentId(result.conversationId); setMobileChatOpen(true); setSearch(''); }}><strong>{result.body.slice(0, 65)}</strong><span>{timeLabel(result.at)}</span></button>)}</div>}
          <div className="connect-list-heading"><span>RECENT CONVERSATIONS</span><button type="button" onClick={() => { setShowContacts(true); setSearch(''); }}>New</button></div>
          <div className="connect-conversation-list">
            {loading ? <div className="connect-list-state"><i /> Loading conversations</div> : visibleConversations.length === 0 ? <div className="connect-list-empty"><span>◌</span><strong>No conversations yet</strong><p>Start a private chat or create a group.</p><button type="button" onClick={() => setShowContacts(true)}>Find people</button></div> : visibleConversations.map(conversation => {
              const person = conversation.members[0];
              const avatarName = conversation.type === 'group' ? conversation.name : person?.name ?? conversation.name;
              return <button key={conversation.id} className={`connect-conversation${currentId === conversation.id ? ' selected' : ''}`} type="button" onClick={() => { setCurrentId(conversation.id); setMobileChatOpen(true); }}>
                <Avatar name={avatarName} online={conversation.type === 'direct' && person?.online} image={conversation.avatarFileId ? `/api/connect/attachments/${conversation.avatarFileId}` : person?.avatarUrl} />
                <span className="connect-conversation-copy"><span className="connect-conversation-top"><strong>{conversation.name}</strong><time>{timeLabel(conversation.lastMessageAt)}</time></span><span className="connect-conversation-bottom"><span>{conversation.lastMessageText || (conversation.type === 'group' ? `${conversation.memberCount} members` : 'Say hello')}</span>{conversation.unreadCount > 0 && <b>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</b>}</span></span>
              </button>;
            })}
          </div>
          <footer className="connect-sidebar-footer"><span className="connect-safe-led" /> Private, member-only conversations <Link href="/">Overview</Link></footer>
        </aside>

        <section className={`connect-chat${mobileChatOpen ? ' connect-chat-mobile-open' : ''}`} aria-label="Conversation">
          {!current ? <div className="connect-welcome"><div className="connect-welcome-mark">N</div><p className="connect-eyebrow">A LITTLE MORE CONNECTED</p><h2>Your conversations,<br />in one calm place.</h2><p>Choose a message from the sidebar or start a new conversation with someone in your workspace.</p><button type="button" onClick={() => setShowContacts(true)}>Start a conversation <span>→</span></button></div> : <>
            <header className="connect-chat-header">
              <button className="connect-back-mobile" type="button" onClick={() => setMobileChatOpen(false)} aria-label="Back to conversations">‹</button>
              <Avatar name={current.type === 'group' ? current.name : peer?.name ?? current.name} online={current.type === 'direct' && peer?.online} image={current.avatarFileId ? `/api/connect/attachments/${current.avatarFileId}` : peer?.avatarUrl} />
              <div className="connect-chat-title"><strong>{current.name}</strong><span>{typingIds.length ? 'typing…' : current.type === 'group' ? `${current.memberCount} members · ${current.description || 'Group conversation'}` : peer?.online ? 'Active now' : 'Private conversation'}</span></div>
              <div className="connect-chat-actions"><button type="button" title="Search this conversation" onClick={() => { setSearch(current.name); }}>⌕</button><button type="button" title="Shared media" onClick={() => void openGallery()}>▧</button>{current.type === 'group' && <button type="button" title="Group details" onClick={() => void openGroupInfo()}>ⓘ</button>}</div>
            </header>
            {error && <div className="connect-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
            <div className="connect-message-scroll" aria-live="polite">
              <div className="connect-date-divider"><span>MESSAGES ARE PRIVATE TO THIS CONVERSATION</span></div>
              {hasOlderMessages && <button className="connect-load-older" type="button" disabled={messageLoading} onClick={() => void loadOlderMessages()}>{messageLoading ? 'Loading…' : 'Load earlier messages'}</button>}
              {messageLoading && messages.length === 0 ? <div className="connect-chat-state">Opening conversation…</div> : currentMessages.length === 0 ? <div className="connect-empty-chat"><span>✳</span><strong>This is the beginning.</strong><p>Send a message to get the conversation moving.</p></div> : currentMessages.map(message => {
                const own = message.senderId === user.id;
                const replied = messages.find(item => item.id === message.replyTo);
                const reactions = [...new Set(message.reactions.map(item => item.emoji))];
                return <article key={message.id} className={`connect-message-row${own ? ' own' : ''}`}>
                  {!own && current.type === 'group' && <span className="connect-message-sender">{current.members.find(member => member.id === message.senderId)?.name ?? 'Member'}</span>}
                  {replied && <button className={`connect-reply-preview${own ? ' own' : ''}`} type="button" onClick={() => document.getElementById(`message-${replied.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><strong>↳ {replied.senderId === user.id ? 'You' : current.members.find(member => member.id === replied.senderId)?.name ?? 'Member'}</strong><span>{replied.body || 'Attachment'}</span></button>}
                  <div id={`message-${message.id}`} className={`connect-bubble${own ? ' own' : ''}`}>
                    {message.body && <p>{message.body}</p>}
                    {message.attachments.map(item => <AttachmentView key={item.fileId} item={item} />)}
                    <footer><time>{timeLabel(message.createdAt)}</time>{message.editedAt && <small>edited</small>}{own && <MessageStatus message={message} userId={user.id} />}</footer>
                    <div className="connect-message-tools"><button type="button" title="Reply" onClick={() => { setReply(message); setEdit(null); }}>↩</button><button type="button" title="Add a reaction" onClick={() => setReactionMenuId(id => id === message.id ? '' : message.id)}>☺</button>{own && <button type="button" title="Edit" onClick={() => { setEdit(message); setReply(null); setDraft(message.body); }}>✎</button>}<button type="button" title="Delete for me" onClick={() => void runMessageAction(message, 'delete-self')}>⌫</button>{(own || (current.type === 'group' && current.adminIds.includes(user.id))) && <button type="button" title="Delete for everyone" onClick={() => void runMessageAction(message, 'delete-everyone')}>×</button>}</div>
                    {reactionMenuId === message.id && <div className="connect-reaction-picker" aria-label="Choose a reaction">{['👍', '❤️', '😂', '🎉'].map(emoji => <button type="button" key={emoji} onClick={() => { setReactionMenuId(''); void runMessageAction(message, 'react', { emoji }); }}>{emoji}</button>)}</div>}
                    {reactions.length > 0 && <div className="connect-reactions">{reactions.map(emoji => <button type="button" key={emoji} onClick={() => void runMessageAction(message, 'react', { emoji })}>{emoji} {message.reactions.filter(reaction => reaction.emoji === emoji).length}</button>)}</div>}
                  </div>
                </article>;
              })}
              <div ref={bottomRef} />
            </div>
            {(reply || edit) && <div className="connect-compose-context"><span>{edit ? 'Editing your message' : `Replying to ${reply?.senderId === user.id ? 'your message' : current.members.find(member => member.id === reply?.senderId)?.name ?? 'member'}`}</span><small>{(edit ? edit.body : reply?.body) || 'Attachment'}</small><button type="button" onClick={() => { setReply(null); setEdit(null); setDraft(''); }}>×</button></div>}
            {files.length > 0 && <div className="connect-upload-queue">{files.map((item, index) => <div key={`${item.file.name}-${index}`}><span>{item.uploaded ? '✓' : '↥'}</span><strong>{item.file.name}</strong><small>{item.progress === undefined ? 'Ready' : `${item.progress}%`}</small>{item.progress !== undefined && !item.uploaded && <button type="button" disabled={sending} onClick={() => void sendMessage()}>Retry</button>}<button type="button" disabled={sending} onClick={() => void removeQueuedFile(index)}>×</button></div>)}</div>}
            <form className="connect-composer" onSubmit={event => void sendMessage(event)}>
              <div className="connect-composer-tools"><button type="button" title="Attach a photo, video, or document" onClick={() => fileInputRef.current?.click()}>＋</button><button type="button" title="Record a voice message" className={recording ? 'recording' : ''} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? '■' : '◖'}</button></div>
              <textarea value={draft} onChange={event => void changeTyping(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={recording ? 'Recording voice message…' : `Write to ${current.name}…`} aria-label="Message" rows={1} />
              <span className="connect-enter-hint">SHIFT + ENTER FOR A NEW LINE</span>
              <button className="connect-send-button" type="submit" disabled={sending || (!draft.trim() && !files.length)}>{sending ? '…' : '↑'}</button>
              <input ref={fileInputRef} type="file" hidden multiple accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={event => chooseFiles(event)} />
              <input ref={voiceInputRef} type="file" hidden onChange={event => chooseFiles(event, true)} />
            </form>
          </>}
        </section>
      </div>

      {showContacts && <div className="connect-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowContacts(false); }}><section className="connect-modal" role="dialog" aria-modal="true" aria-labelledby="connect-contact-title"><header><div><p className="connect-eyebrow">YOUR NEXORA NETWORK</p><h2 id="connect-contact-title">Start something.</h2></div><button type="button" onClick={() => setShowContacts(false)} aria-label="Close">×</button></header><label className="connect-modal-search"><span>⌕</span><input value={contactQuery} onChange={event => setContactQuery(event.target.value)} placeholder="Find a person by name or email" autoFocus /></label><div className="connect-contact-list">{contacts.map(contact => <div className="connect-contact" key={contact.id}><Avatar name={contact.name} online={contact.online} image={contact.avatarUrl} /><span><strong>{contact.name}</strong><small>{contact.email}</small></span>{selectedMembers.includes(contact.id) ? <button className="connect-selected" type="button" onClick={() => setSelectedMembers(ids => ids.filter(id => id !== contact.id))}>Selected</button> : <button type="button" onClick={() => { if (selectedMembers.length) setSelectedMembers(ids => [...ids, contact.id]); else void startDirect(contact); }}>{selectedMembers.length ? 'Add' : 'Message'}</button>}</div>)}{contacts.length === 0 && <div className="connect-modal-empty">No members match that search.</div>}</div><form className="connect-create-group" onSubmit={event => void createGroup(event)}><div><strong>Create a group</strong><small>Select one or more people above, then name your group.</small></div><div className="connect-group-create-fields"><input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="Group name" maxLength={80} /><button type="submit" disabled={creatingGroup || selectedMembers.length === 0 || groupName.trim().length < 2}>{creatingGroup ? 'Creating…' : `Create · ${selectedMembers.length}`}</button></div></form></section></div>}

      {showGallery && <div className="connect-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowGallery(false); }}><section className="connect-modal connect-gallery-modal" role="dialog" aria-modal="true" aria-labelledby="connect-gallery-title"><header><div><p className="connect-eyebrow">SHARED FILES</p><h2 id="connect-gallery-title">Media gallery</h2></div><button type="button" onClick={() => setShowGallery(false)} aria-label="Close">×</button></header><div className="connect-gallery-grid">{gallery.map(item => <div key={item.fileId}>{item.kind === 'image' ? <a href={`/api/connect/attachments/${item.fileId}`} target="_blank" rel="noreferrer"><img src={`/api/connect/attachments/${item.fileId}`} alt={item.fileName} /></a> : item.kind === 'video' ? <video src={`/api/connect/attachments/${item.fileId}`} controls /> : <AttachmentView item={item} />}<small>{item.fileName}</small></div>)}{gallery.length === 0 && <p className="connect-modal-empty">Files shared here will appear in this gallery.</p>}</div></section></div>}

          {showGroupInfo && current?.type === 'group' && <div className="connect-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowGroupInfo(false); }}><section className="connect-modal" role="dialog" aria-modal="true" aria-labelledby="connect-group-title"><header><div><p className="connect-eyebrow">GROUP SPACE</p><h2 id="connect-group-title">{current.name}</h2></div><button type="button" onClick={() => setShowGroupInfo(false)} aria-label="Close">×</button></header><p className="connect-group-description">{current.description || 'A shared conversation for your group.'}</p><div className="connect-group-info-tools"><label className="connect-outline-button">Update group image<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void uploadGroupAvatar(file); event.target.value = ''; }} /></label>{(isAdmin || current.allowMemberEditInfo) && <button className="connect-outline-button" type="button" onClick={() => { const title = window.prompt('Group name', current.name); if (title?.trim()) { const description = window.prompt('Group description', current.description); void updateGroup({ action: 'settings', title: title.trim(), description: description ?? current.description }); } }}>Edit group info</button>}</div>{isAdmin && <div className="connect-group-permissions"><label><input type="checkbox" checked={current.allowMemberInvites} onChange={event => void updateGroup({ action: 'settings', allowMemberInvites: event.target.checked })} />Members can invite people</label><label><input type="checkbox" checked={current.allowMemberEditInfo} onChange={event => void updateGroup({ action: 'settings', allowMemberEditInfo: event.target.checked })} />Members can edit group details</label></div>}<div className="connect-member-list"><strong>{current.memberCount} members</strong>{current.members.map(member => <div key={member.id}><Avatar name={member.name} online={member.online} image={member.avatarUrl} /><span>{member.name}{current.adminIds.includes(member.id) && <small>Admin</small>}</span>{isAdmin && member.id !== user.id && <><button type="button" onClick={() => void updateGroup({ action: 'admin', userId: member.id, enabled: !current.adminIds.includes(member.id) })}>{current.adminIds.includes(member.id) ? 'Remove admin' : 'Make admin'}</button><button type="button" onClick={() => void updateGroup({ action: 'remove', userId: member.id })}>Remove</button></>}</div>)}</div>{(isAdmin || current.allowMemberInvites) && <details className="connect-add-member"><summary>Add a member</summary>{contacts.filter(contact => !current.members.some(member => member.id === contact.id)).map(contact => <button key={contact.id} type="button" onClick={() => void updateGroup({ action: 'add', userIds: [contact.id] })}>＋ {contact.name}</button>)}</details>}<button className="connect-leave-button" type="button" onClick={() => void updateGroup({ action: 'remove', userId: user.id })}>Leave group</button></section></div>}
    </main>
  );
}
