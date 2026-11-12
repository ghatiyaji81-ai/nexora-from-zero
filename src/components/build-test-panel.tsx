'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = { projectId: string; disabled?: boolean; onExplain?: (run: TestRun, action: 'explain' | 'propose') => void };
type TestTarget = {
  runtime: string; framework: string; declared: boolean; scriptName: string | null;
  configs: string[]; testFiles: Array<{ path: string; size: number }>; command: string[] | null;
  unavailableReason: string | null; requirements: string[];
};
type TestSession = { id: string; runtime: string; startedAt: string };
type TestRun = {
  id: string; sessionId: string; framework: string; command: string; selection: string | null;
  status: 'running' | 'passed' | 'failed' | 'cancelled' | 'timed_out' | 'blocked' | 'unavailable';
  exitCode: number | null; stdout: string; stderr: string; durationMs: number | null;
  counts: { total?: number | null; passed?: number | null; failed?: number | null; skipped?: number | null };
  failures: Array<{ name: string; message: string }>; startedAt: string; finishedAt: string | null;
};
type TestData = {
  discovery: TestTarget;
  provider: { available: boolean; reason: string | null };
  sessions: TestSession[];
  runs: TestRun[];
};

async function getError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? 'The request could not be completed.';
}

export function BuildTestPanel({ projectId, disabled = false, onExplain }: Props) {
  const [data, setData] = useState<TestData | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [selection, setSelection] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(120000);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeRunId, setActiveRunId] = useState('');
  const [expandedRun, setExpandedRun] = useState('');
  const refreshTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/build/projects/${projectId}/tests`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await getError(response));
    const body = await response.json() as TestData;
    setData(body);
    setSessionId(current => body.sessions.some(session => session.id === current) ? current : body.sessions[0]?.id ?? '');
    setActiveRunId(current => body.runs.find(run => run.id === current && run.status === 'running')?.id ??
      body.runs.find(run => run.status === 'running')?.id ?? '');
  }, [projectId]);

  useEffect(() => {
    void refresh().catch(error => setNotice(error instanceof Error ? error.message : 'Test information is unavailable.'));
    return () => { if (refreshTimer.current) window.clearInterval(refreshTimer.current); };
  }, [refresh]);

  useEffect(() => {
    if (!busy) {
      if (refreshTimer.current) window.clearInterval(refreshTimer.current);
      refreshTimer.current = null;
      return;
    }
    refreshTimer.current = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2500);
    return () => { if (refreshTimer.current) window.clearInterval(refreshTimer.current); };
  }, [busy, refresh]);

  const target = data?.discovery;
  const activeRun = data?.runs.find(run => run.id === activeRunId && run.status === 'running');
  const completedRuns = (data?.runs ?? []).filter(run => run.status !== 'running');
  const actualCount = (field: 'passed' | 'failed' | 'skipped') => completedRuns.reduce((sum, run) => sum + (run.counts[field] ?? 0), 0);

  async function runTests(selected?: string) {
    if (!target?.command || !sessionId || busy || disabled) return;
    const label = selected ? `Run selected test file ${selected}` : 'Run all discovered tests';
    if (!window.confirm(`${label} in the isolated project session?\n\n${target.command.join(' ')}${selected ? ` ${selected}` : ''}\n\nTest scripts are project code and will execute in the bounded, network-disabled sandbox.`)) return;
    setBusy(true);
    setNotice('Running tests in the isolated execution session. Output and status update from actual provider results.');
    try {
      const response = await fetch(`/api/build/projects/${projectId}/tests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', sessionId, selection: selected || undefined, timeoutMs, approved: true }),
      });
      if (!response.ok) throw new Error(await getError(response));
      const body = await response.json() as { run: TestRun };
      setActiveRunId('');
      setNotice(`Test command finished: ${body.run.status}${body.run.exitCode !== null ? ` · exit ${body.run.exitCode}` : ''}.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The isolated test run failed.');
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function cancelRun() {
    if (!activeRun || cancelling) return;
    setCancelling(true);
    try {
      const response = await fetch(`/api/build/projects/${projectId}/tests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', runId: activeRun.id }),
      });
      if (!response.ok) throw new Error(await getError(response));
      setNotice('The isolated execution container was stopped; test cancellation was recorded.');
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The test run could not be cancelled.');
    } finally { setCancelling(false); }
  }

  return <section className="build-test-panel" aria-label="Automated testing workspace">
    <header className="build-test-heading">
      <div><strong>TESTING / EXECUTION HISTORY</strong><p>Discovery comes from saved manifests and files. A declared framework is not proof that packages are installed.</p></div>
      <button type="button" onClick={() => void refresh().catch(error => setNotice(error instanceof Error ? error.message : 'Refresh failed.'))}>Refresh</button>
    </header>
    {target && <div className="build-test-discovery">
      <div><span>DETECTED</span><strong>{target.framework}</strong><small>{target.declared ? 'Declared in project' : 'Not declared'}</small></div>
      <div><span>RUNTIME</span><strong>{target.runtime}</strong><small>{data?.provider.available ? 'Provider available' : 'Provider unavailable'}</small></div>
      <div><span>TEST FILES</span><strong>{target.testFiles.length}</strong><small>Saved project paths</small></div>
      <p>{target.unavailableReason ?? `Requires: ${target.requirements.join('; ')}.`}</p>
      {target.configs.length > 0 && <p>Configuration: {target.configs.join(', ')}</p>}
    </div>}
    <div className="build-test-controls">
      <label>Isolated session<select value={sessionId} onChange={event => setSessionId(event.target.value)} aria-label="Test execution session">
        <option value="">Select an active session</option>
        {data?.sessions.map(session => <option key={session.id} value={session.id}>{session.runtime} · {new Date(session.startedAt).toLocaleString()}</option>)}
      </select></label>
      <label>Timeout<select value={timeoutMs} onChange={event => setTimeoutMs(Number(event.target.value))}>
        <option value={30000}>30 seconds</option><option value={120000}>2 minutes</option><option value={300000}>5 minutes</option><option value={600000}>10 minutes</option>
      </select></label>
      <button type="button" disabled={disabled || busy || !data?.provider.available || !target?.command || !sessionId || Boolean(target.unavailableReason)} onClick={() => void runTests()}>
        Run all tests
      </button>
      {activeRun && <button type="button" disabled={cancelling} onClick={() => void cancelRun()}>{cancelling ? 'Stopping sandbox…' : 'Cancel and stop sandbox'}</button>}
    </div>
    {!data?.provider.available && <p className="build-test-notice" role="status">{data?.provider.reason ?? 'Checking isolated execution provider…'}</p>}
    {notice && <p className="build-test-notice" role="status">{notice}</p>}
    {target?.testFiles.length ? <div className="build-test-select">
      <label>Run selected test file<select value={selection} onChange={event => setSelection(event.target.value)}>
        <option value="">Choose a discovered file</option>
        {target.testFiles.map(file => <option value={file.path} key={file.path}>{file.path}</option>)}
      </select></label>
      <button type="button" disabled={disabled || busy || !data?.provider.available || !sessionId || !selection} onClick={() => void runTests(selection)}>Run selected</button>
      <button type="button" disabled={disabled || busy || !data?.provider.available || !sessionId} onClick={() => {
        const failed = completedRuns.find(run => run.status === 'failed');
        void runTests(failed?.selection ?? undefined);
      }}>Rerun last failed selection</button>
    </div> : <p className="build-test-empty">No supported test files were discovered. Framework counts and coverage are not inferred from configuration alone.</p>}
    <div className="build-test-summary" aria-label="Actual recorded test totals">
      <span>Recorded pass: <strong>{actualCount('passed')}</strong></span>
      <span>Recorded fail: <strong>{actualCount('failed')}</strong></span>
      <span>Recorded skip: <strong>{actualCount('skipped')}</strong></span>
      <small>Totals include only parsed counts from completed runner output.</small>
    </div>
    {activeRun && <p className="build-test-running" role="status">Running {activeRun.command} · started {new Date(activeRun.startedAt).toLocaleTimeString()}</p>}
    <h3>Recent runs</h3>
    {!data?.runs.length ? <p className="build-test-empty">No test runs have been recorded.</p> :
      <ul className="build-test-history">{data.runs.map(run => <li key={run.id}>
        <div className="build-test-run-title"><strong className={`build-test-${run.status}`}>{run.status.replace('_', ' ').toUpperCase()}</strong><span>{run.framework} · {new Date(run.startedAt).toLocaleString()}</span></div>
        <code>{run.command}</code>
        <small>{run.durationMs === null ? 'In progress' : `${(run.durationMs / 1000).toFixed(1)}s`} · {run.exitCode === null ? 'no exit code yet' : `exit ${run.exitCode}`} · {run.counts.total === undefined ? 'counts unavailable' : `${run.counts.passed ?? 0} passed, ${run.counts.failed ?? 0} failed, ${run.counts.skipped ?? 0} skipped`}</small>
        <div className="build-test-actions">
          <button type="button" onClick={() => setExpandedRun(expandedRun === run.id ? '' : run.id)}>{expandedRun === run.id ? 'Hide output' : 'View output'}</button>
          {run.status === 'failed' && <button type="button" disabled={!onExplain} onClick={() => onExplain?.(run, 'explain')}>Explain with THINK</button>}
          {run.status === 'failed' && <button type="button" disabled={!onExplain} onClick={() => onExplain?.(run, 'propose')}>Prepare fix with THINK</button>}
        </div>
        {expandedRun === run.id && <pre>{`${run.stdout}${run.stderr ? `\n[stderr]\n${run.stderr}` : ''}` || 'No test output was captured.'}</pre>}
        {run.failures.length > 0 && <ul className="build-test-failures">{run.failures.map((failure, index) => <li key={`${failure.name}-${index}`}><strong>{failure.name}</strong>{failure.message && <span>{failure.message}</span>}</li>)}</ul>}
      </li>)}</ul>}
    <p className="build-test-footnote">No live output streaming or coverage report is available. Tests run only after explicit confirmation in the existing isolated session. Docker containers share the host kernel.</p>
  </section>;
}
