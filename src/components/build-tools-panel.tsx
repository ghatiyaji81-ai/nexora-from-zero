'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  projectId: string;
  mode: 'terminal' | 'testing' | 'git';
  disabled?: boolean;
  beforeSync?: () => Promise<boolean>;
  onSync?: () => Promise<void>;
};
type Session = { id: string; runtime: string; status: 'starting' | 'active' | 'stopped' | 'failed'; busy: boolean; startedAt: string };
type Log = { id: string; kind: 'command' | 'git'; command: string; stdout: string; stderr: string; exitCode: number; durationMs: number; createdAt: string };
type Result = { exitCode: number; stdout: string; stderr: string; durationMs: number };

async function getError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? 'The request could not be completed.';
}

export function BuildToolsPanel({ projectId, mode, disabled = false, beforeSync, onSync }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [command, setCommand] = useState('');
  const [path, setPath] = useState('');
  const [message, setMessage] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [branch, setBranch] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [compareBranch, setCompareBranch] = useState('');
  const [restoreCommit, setRestoreCommit] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const historyIndex = useRef(-1);
  const commandHistory = useRef<string[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/build/projects/${projectId}/execution`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await getError(response));
    const body = await response.json() as { sessions: Session[]; logs: Log[] };
    setSessions(body.sessions);
    setLogs(body.logs);
    if (!sessionId || !body.sessions.some(item => item.id === sessionId)) {
      setSessionId(body.sessions.find(item => item.status === 'active')?.id ?? body.sessions[0]?.id ?? '');
    }
  }, [projectId, sessionId]);

  useEffect(() => {
    let active = true;
    void refresh().catch(error => { if (active) setNotice(error instanceof Error ? error.message : 'Execution history is unavailable.'); });
    return () => { active = false; };
  }, [refresh]);

  const activeSession = sessions.find(item => item.id === sessionId);

  async function executionAction(body: Record<string, unknown>) {
    const response = await fetch(`/api/build/projects/${projectId}/execution`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await getError(response));
    return response.json() as Promise<{ session?: Session; result?: Result; synchronized?: number; files?: number }>;
  }

  async function startSession() {
    setBusy(true);
    setNotice('Starting isolated session…');
    try {
      const body = await executionAction({ action: 'start' });
      if (body.session) setSessionId(body.session.id);
      await refresh();
      setNotice('Isolated offline session started from a copy of the saved project files.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The isolated session could not be started.');
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function stopSession() {
    if (!sessionId) return;
    if (!window.confirm('Stopping permanently deletes this isolated workspace and its session-local Git repository. Synchronize wanted source changes first. Continue?')) return;
    setBusy(true);
    setNotice(busy ? 'Stopping the session to cancel the running operation…' : '');
    try {
      await executionAction({ action: 'stop', sessionId });
      await refresh();
      setNotice('Session stopped and its isolated container and workspace volume were removed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The session could not be stopped.');
    } finally { setBusy(false); }
  }

  async function syncWorkspace() {
    if (!sessionId || !window.confirm('Synchronize sandbox source changes into this project? Modified and deleted files will be versioned.')) return;
    setBusy(true);
    setNotice('');
    try {
      if (beforeSync && !await beforeSync()) return;
      const body = await executionAction({ action: 'sync', sessionId, approved: true });
      await onSync?.();
      await refresh();
      setNotice(`Saved ${body.synchronized ?? 0} changed file(s) to the project. Removed files have a restorable history snapshot.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Workspace changes could not be synchronized.');
    } finally { setBusy(false); }
  }

  async function executeCommand(requestedCommand: string) {
    const requested = requestedCommand.trim();
    if (!requested || !sessionId) return;
    commandHistory.current = [requested, ...commandHistory.current.filter(item => item !== requested)].slice(0, 30);
    historyIndex.current = -1;
    setBusy(true);
    setNotice('');
    setResult(null);
    try {
      const body = await executionAction({ action: 'run', sessionId, command: requested, approved: true });
      setResult(body.result ?? null);
      setCommand('');
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The isolated command failed.');
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function runCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await executeCommand(command);
  }

  async function gitAction(action: string, extra: Record<string, unknown> = {}) {
    if (!sessionId) return;
    setBusy(true);
    setNotice('');
    setResult(null);
    try {
      const response = await fetch(`/api/build/projects/${projectId}/git`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId, ...extra }),
      });
      if (!response.ok) throw new Error(await getError(response));
      const body = await response.json() as { result: Result };
      setResult(body.result);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Git operation failed.');
    } finally { setBusy(false); }
  }

  function commandKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      historyIndex.current = Math.min(historyIndex.current + 1, commandHistory.current.length - 1);
      setCommand(commandHistory.current[historyIndex.current] ?? '');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex.current = Math.max(historyIndex.current - 1, -1);
      setCommand(historyIndex.current < 0 ? '' : commandHistory.current[historyIndex.current] ?? '');
    }
  }

  const sessionControls = <div className="build-tool-session">
    <label>Session<select value={sessionId} onChange={event => setSessionId(event.target.value)} aria-label="Execution session">
      <option value="">No session selected</option>
      {sessions.map(item => <option key={item.id} value={item.id}>{item.runtime} · {item.status} · {new Date(item.startedAt).toLocaleString()}</option>)}
    </select></label>
    {!disabled && <button type="button" className="build-quiet-button" disabled={busy} onClick={() => void startSession()}>Start isolated session</button>}
    {activeSession && activeSession.status !== 'stopped' && <button type="button" className="build-quiet-button" onClick={() => void stopSession()}>{busy ? 'Cancel / stop' : activeSession.status === 'failed' ? 'Clean up session' : 'Stop session'}</button>}
    <button type="button" className="build-quiet-button" disabled={busy} onClick={() => void refresh()}>Refresh</button>
  </div>;

  return <div className="build-tools-panel">
    <div className="build-tools-heading">
      <div><strong>{mode === 'git' ? 'Isolated Git' : mode === 'testing' ? 'Project checks' : 'Restricted terminal'}</strong>
        <p>Docker sessions have no network, run as non-root with resource limits, and cannot access NEXORA credentials.</p></div>
      {sessionControls}
    </div>
    {notice && <p className="build-tools-notice" role="status">{notice}</p>}
    {activeSession?.status === 'active' && !disabled && <button className="build-sync-button" type="button" disabled={busy} onClick={() => void syncWorkspace()}>Save sandbox changes to project</button>}
    {mode === 'terminal' || mode === 'testing' ? <>
      {mode === 'testing' && <div className="build-test-actions">
        <button type="button" disabled={disabled || busy || activeSession?.status !== 'active'} onClick={() => void executeCommand('npm run test')}>Run npm tests</button>
        <button type="button" disabled={disabled || busy || activeSession?.status !== 'active'} onClick={() => void executeCommand('npm run build')}>Run npm build</button>
        <button type="button" disabled={disabled || busy || activeSession?.status !== 'active'} onClick={() => void executeCommand('python -m pytest')}>Run pytest</button>
      </div>}
      <form className="build-command-form" onSubmit={event => void runCommand(event)}>
        <label htmlFor="build-command">Approved command</label>
        <div><span aria-hidden="true">$</span><input id="build-command" value={command} onChange={event => setCommand(event.target.value)} onKeyDown={commandKeyDown} maxLength={300} disabled={disabled || busy || activeSession?.status !== 'active'} placeholder="npm run build" autoComplete="off" /><button type="submit" disabled={disabled || busy || !command.trim() || activeSession?.status !== 'active'}>{busy ? 'Running…' : 'Run approved command'}</button></div>
        <small>Only allowlisted scripts and offline package commands run. Shell operators, arbitrary commands and network access are rejected.</small>
      </form>
    </> : <div className="build-git-controls">
      <div className="build-git-actions">
        <button type="button" disabled={disabled || busy || activeSession?.status !== 'active'} onClick={() => void gitAction('init')}>Initialize</button>
        <button type="button" disabled={disabled || busy || activeSession?.status !== 'active'} onClick={() => void gitAction('status')}>Status</button>
        <button type="button" disabled={disabled || busy || activeSession?.status !== 'active'} onClick={() => void gitAction('diff')}>Working diff</button>
        <button type="button" disabled={disabled || busy || activeSession?.status !== 'active'} onClick={() => void gitAction('diff', { cached: true })}>Staged diff</button>
        <button type="button" disabled={disabled || busy || activeSession?.status !== 'active'} onClick={() => void gitAction('history')}>History</button>
        <button type="button" disabled={disabled || busy || activeSession?.status !== 'active'} onClick={() => void gitAction('branches')}>Branches</button>
      </div>
      <div className="build-git-form-row">
        <form onSubmit={event => { event.preventDefault(); void gitAction('stage', { path }); }}><label>Stage path<input value={path} onChange={event => setPath(event.target.value)} placeholder="src/index.ts" /></label><button disabled={disabled || busy || !path.trim() || activeSession?.status !== 'active'}>Stage</button></form>
        <button type="button" disabled={disabled || busy || !path.trim() || activeSession?.status !== 'active'} onClick={() => void gitAction('unstage', { path })}>Unstage path</button>
        <form onSubmit={event => { event.preventDefault(); void gitAction('create-branch', { branch }); }}><label>New branch<input value={branch} onChange={event => setBranch(event.target.value)} placeholder="feature/name" /></label><button disabled={disabled || busy || !branch.trim() || activeSession?.status !== 'active'}>Create &amp; switch</button></form>
        <form onSubmit={event => { event.preventDefault(); void gitAction('switch-branch', { branch }); }}><label>Switch branch<input value={branch} onChange={event => setBranch(event.target.value)} placeholder="main" /></label><button disabled={disabled || busy || !branch.trim() || activeSession?.status !== 'active'}>Switch</button></form>
        <form onSubmit={event => { event.preventDefault(); void gitAction('compare', { base: baseBranch, compare: compareBranch }); }}><label>Compare branches<input value={baseBranch} onChange={event => setBaseBranch(event.target.value)} placeholder="main" /></label><label>With<input value={compareBranch} onChange={event => setCompareBranch(event.target.value)} placeholder="feature/name" /></label><button disabled={disabled || busy || !baseBranch.trim() || !compareBranch.trim() || activeSession?.status !== 'active'}>Compare</button></form>
      </div>
      <form className="build-git-restore-form" onSubmit={event => {
        event.preventDefault();
        if (window.confirm(`Restore ${path} from ${restoreCommit}? This overwrites the sandbox copy of that file.`)) {
          void gitAction('restore', { commit: restoreCommit, path, approved: true });
        }
      }}>
        <label>Restore commit<input value={restoreCommit} onChange={event => setRestoreCommit(event.target.value)} placeholder="commit SHA" /></label>
        <span>Uses the file path above</span>
        <button disabled={disabled || busy || !restoreCommit.trim() || !path.trim() || activeSession?.status !== 'active'}>Confirm restore file</button>
      </form>
      <form className="build-git-commit-form" onSubmit={event => { event.preventDefault(); void gitAction('commit', { message, authorName, authorEmail }); }}>
        <label>Commit message<input value={message} onChange={event => setMessage(event.target.value)} maxLength={500} required /></label>
        <label>Author<input value={authorName} onChange={event => setAuthorName(event.target.value)} maxLength={100} required /></label>
        <label>Email<input type="email" value={authorEmail} onChange={event => setAuthorEmail(event.target.value)} maxLength={200} required /></label>
        <button disabled={disabled || busy || activeSession?.status !== 'active'}>Commit staged changes</button>
      </form>
    </div>}
    {result && <div className="build-command-result" aria-live="polite">
      <div><strong>{result.exitCode === 0 ? 'Completed' : 'Command failed'}</strong><span>Exit {result.exitCode} · {result.durationMs} ms</span></div>
      {result.stdout && <pre>{result.stdout}</pre>}{result.stderr && <pre className="is-stderr">{result.stderr}</pre>}
    </div>}
    {mode !== 'git' && logs.length > 0 && <details className="build-execution-history"><summary>Recent execution history ({logs.length})</summary><ul>{logs.filter(log => log.kind === 'command').map(log => <li key={log.id}><span><code>{log.command}</code><small>{new Date(log.createdAt).toLocaleString()} · exit {log.exitCode} · {log.durationMs} ms</small></span><button type="button" onClick={() => setResult({ exitCode: log.exitCode, stdout: log.stdout, stderr: log.stderr, durationMs: log.durationMs })}>View output</button></li>)}</ul></details>}
    {mode === 'git' && logs.filter(log => log.kind === 'git').length > 0 && <details className="build-execution-history"><summary>Recent Git operations</summary><ul>{logs.filter(log => log.kind === 'git').map(log => <li key={log.id}><span><code>{log.command}</code><small>{new Date(log.createdAt).toLocaleString()} · exit {log.exitCode}</small></span><button type="button" onClick={() => setResult({ exitCode: log.exitCode, stdout: log.stdout, stderr: log.stderr, durationMs: log.durationMs })}>View output</button></li>)}</ul></details>}
  </div>;
}
