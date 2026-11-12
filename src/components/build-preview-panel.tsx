'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Props = {
  projectId: string;
  mode: 'preview' | 'debug';
  disabled?: boolean;
  beforeStart?: () => Promise<boolean>;
  onExplain?: (diagnostic: Diagnostic, action: 'explain' | 'propose') => void;
};
type Target = { framework: string; runtime: string; command: string | null; status: 'detected' | 'unsupported'; explanation: string };
type PreviewSession = { id: string; executionSessionId: string; framework: string; runtime: string; status: string; startedAt: string; stoppedAt: string | null; lastError: string | null };
type ExecutionSession = { id: string; runtime: string; startedAt: string };
type Diagnostic = {
  id: string;
  sessionId: string;
  logId: string;
  source: 'build' | 'runtime' | 'test' | 'execution';
  severity: 'error';
  command: string;
  message: string;
  filePath: string | null;
  line: number | null;
  column: number | null;
  stackTrace: string;
  exitCode: number;
  occurredAt: string;
};
type PreviewData = { availability: { available: boolean; reason: string | null }; target: Target; sessions: PreviewSession[]; executionSessions: ExecutionSession[] };

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? 'The request could not be completed.';
}

export function BuildPreviewPanel({ projectId, mode, disabled = false, beforeStart, onExplain }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [errors, setErrors] = useState<Diagnostic[]>([]);
  const [query, setQuery] = useState('');
  const [expandedError, setExpandedError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshPreview = useCallback(async () => {
    const response = await fetch(`/api/build/projects/${projectId}/preview`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await responseError(response));
    const body = await response.json() as PreviewData;
    setPreview(body);
    setSessionId(current => body.executionSessions.some(session => session.id === current)
      ? current
      : body.executionSessions[0]?.id ?? '');
    setNotice(body.availability.reason ?? '');
  }, [projectId]);

  const refreshDebug = useCallback(async () => {
    const response = await fetch(`/api/build/projects/${projectId}/debug`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await responseError(response));
    const body = await response.json() as { errors: Diagnostic[] };
    setErrors(body.errors);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    const load = mode === 'preview' ? refreshPreview : refreshDebug;
    void load().catch(error => {
      if (active) setNotice(error instanceof Error ? error.message : 'BUILD preview information is unavailable.');
    });
    return () => { active = false; };
  }, [mode, refreshDebug, refreshPreview]);

  const filteredErrors = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? errors.filter(error =>
      `${error.message} ${error.filePath ?? ''} ${error.command} ${error.stackTrace}`.toLowerCase().includes(value),
    ) : errors;
  }, [errors, query]);

  async function runAction(action: 'start' | 'restart' | 'stop' | 'reload', selectedPreview?: PreviewSession) {
    if (busy || disabled) return;
    setBusy(true);
    setNotice(action === 'start' ? 'Checking preview gateway…' : `${action[0].toUpperCase()}${action.slice(1)}ing preview…`);
    try {
      if ((action === 'start' || action === 'restart') && beforeStart && !await beforeStart()) {
        throw new Error('Save the current editor changes before requesting a preview.');
      }
      const body = action === 'start'
        ? { action, sessionId }
        : { action, previewId: selectedPreview?.id, ...(action === 'restart' ? { sessionId: selectedPreview?.executionSessionId } : {}) };
      const response = await fetch(`/api/build/projects/${projectId}/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice('Preview provider accepted the request.');
      await refreshPreview();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The preview request failed.');
    } finally { setBusy(false); }
  }

  if (mode === 'debug') {
    return <section className="build-debug-panel" aria-label="Build diagnostics">
      <header className="build-preview-heading"><div><strong>DEBUGGING / DETECTED FAILURES</strong><p>Only persisted command output with a non-zero exit code is listed. No live runtime process is currently monitored.</p></div><button type="button" onClick={() => void refreshDebug().catch(error => setNotice(error instanceof Error ? error.message : 'Diagnostics could not be refreshed.'))}>Refresh</button></header>
      <div className="build-debug-search"><label htmlFor="build-debug-search">Filter saved diagnostics</label><input id="build-debug-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Message, file, command, stack…" /></div>
      {notice && <p className="build-preview-notice" role="status">{notice}</p>}
      {!filteredErrors.length ? <p className="build-preview-empty">{errors.length ? 'No saved diagnostics match this filter.' : 'No failed BUILD command output has been recorded.'}</p> :
        <ul className="build-debug-list">{filteredErrors.map(error => <li key={error.id}>
          <div className="build-debug-item-heading">
            <strong className="severity-high">ERROR · {error.source.toUpperCase()}</strong>
            <time dateTime={error.occurredAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(error.occurredAt))}</time>
          </div>
          <p>{error.message}</p>
          <small>{error.command} · exit {error.exitCode}{error.filePath ? ` · ${error.filePath}${error.line ? `:${error.line}${error.column ? `:${error.column}` : ''}` : ''}` : ''} · session {error.sessionId.slice(0, 8)}</small>
          <div className="build-debug-actions">
            <button type="button" onClick={() => setExpandedError(expandedError === error.id ? '' : error.id)}>{expandedError === error.id ? 'Hide output' : 'Show stack/output'}</button>
            <button type="button" disabled={!onExplain} onClick={() => onExplain?.(error, 'explain')}>Explain with THINK</button>
            <button type="button" disabled={!onExplain} onClick={() => onExplain?.(error, 'propose')}>Prepare fix with THINK</button>
          </div>
          {expandedError === error.id && <pre>{error.stackTrace || 'No command output was captured.'}</pre>}
        </li>)}</ul>}
    </section>;
  }

  const activeSession = preview?.sessions.find(session => session.id === sessionId) ??
    preview?.sessions.find(session => session.status === 'running') ??
    preview?.sessions[0];
  return <section className="build-preview-panel" aria-label="Application preview">
    <header className="build-preview-heading"><div><strong>LIVE APPLICATION PREVIEW</strong><p>Preview code runs only through an isolated gateway. No project is executed by the NEXORA application process.</p></div><button type="button" onClick={() => void refreshPreview().catch(error => setNotice(error instanceof Error ? error.message : 'Preview status could not be refreshed.'))}>Refresh status</button></header>
    <div className="build-preview-status">
      <span className={`build-preview-indicator${preview?.availability.available ? ' is-ready' : ''}`} aria-hidden="true" />
      <strong>{preview?.availability.available ? activeSession?.status?.toUpperCase() ?? 'AVAILABLE' : 'UNAVAILABLE'}</strong>
      <span>{preview?.target ? `${preview.target.framework} · ${preview.target.runtime}` : 'Detecting project…'}</span>
      {preview?.target.command && <code>{preview.target.command}</code>}
    </div>
    <p className="build-preview-notice" role="status">{notice || preview?.target.explanation}</p>
    {preview?.target.status === 'unsupported' && <p className="build-preview-empty">{preview.target.explanation}</p>}
    {!preview?.availability.available && <div className="build-preview-placeholder"><strong>Secure browser rendering is not configured.</strong><p>The existing execution containers have no network access and no published ports. BUILD will not expose a container directly or proxy an untrusted app through the NEXORA origin.</p></div>}
    {preview?.executionSessions.length ? <label className="build-preview-session-select">Execution snapshot
      <select value={sessionId} onChange={event => setSessionId(event.target.value)}>
        {preview.executionSessions.map(session => <option key={session.id} value={session.id}>{session.runtime} · {new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(session.startedAt))} · {session.id.slice(0, 8)}</option>)}
      </select>
    </label> : <p className="build-preview-empty">Start an isolated execution session before previewing a saved project snapshot.</p>}
    {preview?.availability.available && preview.sessions.length > 0 && <div className="build-preview-session-list">{preview.sessions.map(session =>
      <button type="button" key={session.id} className={session.id === activeSession?.id ? 'is-active' : ''} onClick={() => setSessionId(session.id)}>
        {session.framework} · {session.status} · {new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(session.startedAt))}
      </button>)}</div>}
    <div className="build-preview-actions">
      <button type="button" disabled={disabled || busy || !preview?.availability.available || !sessionId} onClick={() => void runAction('start')}>Start</button>
      <button type="button" disabled={disabled || busy || !preview?.availability.available || !activeSession} onClick={() => void runAction('restart', activeSession)}>Restart</button>
      <button type="button" disabled={disabled || busy || !preview?.availability.available || !activeSession} onClick={() => void runAction('stop', activeSession)}>Stop</button>
      <button type="button" disabled={disabled || busy || !preview?.availability.available || !activeSession} onClick={() => void runAction('reload', activeSession)}>Reload</button>
      <span>Responsive device views and separate-window access activate only when a safe preview URL is issued by the gateway.</span>
    </div>
  </section>;
}
