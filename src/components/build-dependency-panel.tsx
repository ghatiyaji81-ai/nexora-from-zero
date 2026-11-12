'use client';

import { useCallback, useEffect, useState } from 'react';

type Props = { projectId: string; disabled?: boolean; beforeRestore?: () => Promise<boolean>; onRestored?: () => Promise<void> };
type DependencyInfo = {
  packageManager: string | null;
  lockfile: string | null;
  lockfilePresent: boolean;
  manifestPresent: boolean;
  dependencies: Array<{ name: string; version: string; kind: string }>;
  devDependencies: Array<{ name: string; version: string; kind: string }>;
  installed: 'unknown';
  registry: { available: boolean; reason: string };
  operations: { available: boolean; reason: string };
  vulnerabilities: { available: boolean; reason: string };
};
type Snapshot = { id: string; files: Array<{ path: string; revision: number; sha256: string }>; createdAt: string };
type Operation = { id: string; action: string; packageName: string | null; version: string | null; status: string; reason: string; createdAt: string };

async function getError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? 'The request could not be completed.';
}

export function BuildDependencyPanel({ projectId, disabled = false, beforeRestore, onRestored }: Props) {
  const [inspection, setInspection] = useState<DependencyInfo | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/build/projects/${projectId}/dependencies`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await getError(response));
    const body = await response.json() as { inspection: DependencyInfo; snapshots: Snapshot[]; operations: Operation[] };
    setInspection(body.inspection);
    setSnapshots(body.snapshots);
    setOperations(body.operations);
  }, [projectId]);

  useEffect(() => {
    void refresh().catch(error => setNotice(error instanceof Error ? error.message : 'Dependency information is unavailable.'));
  }, [refresh]);

  async function snapshot() {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(`/api/build/projects/${projectId}/dependencies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'snapshot' }),
      });
      if (!response.ok) throw new Error(await getError(response));
      setNotice('Manifest and lockfile copies were stored in private project storage for explicit restoration.');
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The recovery snapshot failed.'); }
    finally { setBusy(false); }
  }

  async function restore(item: Snapshot) {
    if (!window.confirm(`Restore ${item.files.length} dependency file(s) from this private snapshot? Current versions will be retained in project history.`)) return;
    setBusy(true);
    try {
      if (beforeRestore && !await beforeRestore()) {
        setNotice('Save the current editor changes before restoring dependency files.');
        return;
      }
      const response = await fetch(`/api/build/projects/${projectId}/dependencies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', snapshotId: item.id, approved: true }),
      });
      if (!response.ok) throw new Error(await getError(response));
      setNotice('Dependency files were restored. Other project files were not changed.');
      await onRestored?.();
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Dependency rollback failed.'); }
    finally { setBusy(false); }
  }

  const visible = (inspection?.dependencies ?? []).filter(dependency =>
    `${dependency.name} ${dependency.version} ${dependency.kind}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return <section className="build-dependency-panel" aria-label="Dependency management">
    <header className="build-test-heading"><div><strong>DEPENDENCY EXPLORER</strong><p>Read-only manifest inspection, private recovery snapshots, and truthful provider status.</p></div>
      <button type="button" onClick={() => void refresh().catch(error => setNotice(error instanceof Error ? error.message : 'Refresh failed.'))}>Refresh</button>
    </header>
    {notice && <p className="build-test-notice" role="status">{notice}</p>}
    <div className="build-dependency-meta">
      <span>Manager <strong>{inspection?.packageManager ?? 'not detected'}</strong></span>
      <span>Lockfile <strong>{inspection?.lockfile ?? 'not detected'}</strong></span>
      <span>Installed state <strong>unknown</strong></span>
      <span>Manifest <strong>{inspection?.manifestPresent ? 'detected' : 'not detected'}</strong></span>
    </div>
    {inspection && !inspection.lockfilePresent && inspection.lockfile && <p className="build-test-notice">A package manager was detected, but its expected lockfile {inspection.lockfile} is missing.</p>}
    {inspection && <div className="build-dependency-provider-status">
      <p><strong>Install/update/outdated checks unavailable.</strong> {inspection.operations.reason}</p>
      <p><strong>Registry:</strong> {inspection.registry.reason}</p>
      <p><strong>Vulnerability scanning:</strong> {inspection.vulnerabilities.reason}</p>
    </div>}
    <div className="build-dependency-controls">
      <label>Filter dependencies<input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Package name or version" /></label>
      <button type="button" disabled={disabled || busy || !inspection?.manifestPresent} onClick={() => void snapshot()}>Create private recovery snapshot</button>
    </div>
    {!visible.length ? <p className="build-test-empty">No declared dependencies were found in supported manifest files.</p> :
      <ul className="build-dependency-list">{visible.map((dependency, index) => <li key={`${dependency.kind}-${dependency.name}-${index}`}>
        <strong>{dependency.name}</strong><code>{dependency.version}</code><span>{dependency.kind}</span>
      </li>)}</ul>}
    <h3>Recovery snapshots</h3>
    {!snapshots.length ? <p className="build-test-empty">No dependency snapshots have been created.</p> :
      <ul className="build-dependency-snapshots">{snapshots.map(item => <li key={item.id}>
        <span><strong>{new Date(item.createdAt).toLocaleString()}</strong><small>{item.files.map(file => `${file.path} · r${file.revision}`).join(', ')}</small></span>
        <button type="button" disabled={disabled || busy} onClick={() => void restore(item)}>Restore snapshot</button>
      </li>)}</ul>}
    {operations.length > 0 && <><h3>Blocked operation requests</h3><ul className="build-dependency-snapshots">{operations.map(operation => <li key={operation.id}><span><strong>{operation.status.toUpperCase()} · {operation.action} {operation.packageName ?? ''} {operation.version ?? ''}</strong><small>{operation.reason}</small></span></li>)}</ul></>}
    <p className="build-test-footnote">Package changes are blocked because there is no approved registry broker. No manifests, lockfiles, or packages are modified by this panel. Private snapshots can restore dependency files explicitly; restore is versioned and may report partial application if concurrent writes occur.</p>
  </section>;
}
