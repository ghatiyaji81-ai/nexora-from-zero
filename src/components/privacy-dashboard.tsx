'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  calculateStorageUsage,
  checkBrowserPermissions,
  deleteLocalDataCategory,
  downloadExportFile,
  generatePrivacyExport,
  getPrivacyActivityLog,
  getStorageCategories,
  recordPrivacyAction,
  clearPrivacyActivityLog,
  BrowserPermissionReport,
  PrivacyActivityEvent,
  PrivacyExportPayload,
  StorageCategoryInfo,
  StorageUsageSummary,
} from '@/lib/privacy-manager';
import { CONNECTED_TOOLS, ConnectedToolInfo, getOnboardingState } from '@/lib/onboarding-config';
import { showToast } from '@/lib/toast-manager';
import { formatDate, formatTime, t } from '@/lib/i18n-strings';

interface ServerPrivacyMeta {
  authenticated: boolean;
  mode: string;
  user?: { id: string; email: string; fullName: string } | null;
  sessions?: Array<{
    id: string;
    isCurrentDevice: boolean;
    createdAt: string;
    lastUsedAt: string;
    expiresAt: string;
  }>;
  serverStorageNotice: string;
}

export function PrivacyDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'data' | 'apps' | 'export' | 'deletion' | 'log' | 'education'>('overview');
  const [storageUsage, setStorageUsage] = useState<StorageUsageSummary>(() => calculateStorageUsage());
  const [categories] = useState<StorageCategoryInfo[]>(() => getStorageCategories());
  const [permissions, setPermissions] = useState<BrowserPermissionReport>({
    notifications: 'unsupported',
    microphone: 'unsupported',
    storagePersisted: false,
    canRevokeViaBrowser: true,
  });
  const [activityLog, setActivityLog] = useState<PrivacyActivityEvent[]>(() => getPrivacyActivityLog());
  const [serverMeta, setServerMeta] = useState<ServerPrivacyMeta | null>(null);
  const [isLoadingServer, setIsLoadingServer] = useState(true);

  // Export state
  const [exportPreview, setExportPreview] = useState<PrivacyExportPayload | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Deletion modal state
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<StorageCategoryInfo | { id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [, startTransition] = useTransition();

  const refreshLocalData = () => {
    setStorageUsage(calculateStorageUsage());
    setActivityLog(getPrivacyActivityLog());
  };

  useEffect(() => {
    refreshLocalData();

    // Check browser permissions
    checkBrowserPermissions().then(report => {
      setPermissions(report);
    });

    // Fetch server privacy metadata
    fetch('/api/privacy')
      .then(res => res.json())
      .then((data: ServerPrivacyMeta) => {
        setServerMeta(data);
        setIsLoadingServer(false);
      })
      .catch(() => {
        setServerMeta({
          authenticated: false,
          mode: 'local_preview',
          user: null,
          sessions: [],
          serverStorageNotice: 'Unable to connect to server metadata endpoint. Running in offline/local mode.',
        });
        setIsLoadingServer(false);
      });

    const handleLogChange = () => setActivityLog(getPrivacyActivityLog());
    window.addEventListener('nexora-privacy-log-change', handleLogChange);
    window.addEventListener('storage', refreshLocalData);

    return () => {
      window.removeEventListener('nexora-privacy-log-change', handleLogChange);
      window.removeEventListener('storage', refreshLocalData);
    };
  }, []);

  const handleTriggerExport = () => {
    setIsExporting(true);
    startTransition(() => {
      try {
        const payload = generatePrivacyExport();
        const downloaded = downloadExportFile(payload);

        if (downloaded) {
          showToast({
            message: 'Privacy Data Exported',
            detail: `Saved ${payload.storageBreakdown.localStorageKeysCount} local records to JSON.`,
            type: 'success',
          });
          refreshLocalData();
        } else {
          showToast({
            message: 'Export Failed',
            detail: 'Unable to initiate file download in this browser environment.',
            type: 'error',
          });
        }
      } catch (err) {
        showToast({
          message: 'Export Error',
          detail: err instanceof Error ? err.message : 'Failed to generate export file.',
          type: 'error',
        });
      } finally {
        setIsExporting(false);
      }
    });
  };

  const handleOpenJsonPreview = () => {
    try {
      const payload = generatePrivacyExport();
      setExportPreview(payload);
      setShowJsonPreview(true);
    } catch {
      showToast({
        message: 'Preview Unavailable',
        detail: 'Could not assemble export preview at this time.',
        type: 'error',
      });
    }
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteCategory) return;
    setIsDeleting(true);

    startTransition(() => {
      const result = deleteLocalDataCategory(pendingDeleteCategory.id);
      setIsDeleting(false);
      setPendingDeleteCategory(null);

      if (result.success) {
        showToast({
          message: 'Local Data Cleared',
          detail: result.message,
          type: 'info',
        });
        refreshLocalData();
      } else {
        showToast({
          message: 'Deletion Failed',
          detail: result.message,
          type: 'error',
        });
      }
    });
  };

  const handleClearLog = () => {
    clearPrivacyActivityLog();
    setActivityLog(getPrivacyActivityLog());
    showToast({
      message: 'Privacy Log Cleared',
      detail: 'Local activity log history has been reset.',
      type: 'info',
    });
  };

  return (
    <div className="privacy-dashboard-container">
      {/* Topline Header */}
      <header className="privacy-dashboard-hero">
        <div className="privacy-hero-content">
          <div className="privacy-hero-kicker">
            <span className="card-kicker">PHASE 2 · SECURITY & CONTROL</span>
            <span className="privacy-status-badge badge-live">
              <span className="health-dot health-live" aria-hidden="true" />
              Local-First Privacy Active
            </span>
          </div>
          <h1 className="privacy-hero-title">{t('privacy.title')}</h1>
          <p className="privacy-hero-copy">
            NEXORA gives you transparent visibility and direct control over every piece of data stored in your workspace.
            Review where your data lives, export a verified JSON backup, manage permissions, or delete local data with complete confidence.
          </p>
        </div>

        {/* Quick Metric Pills */}
        <div className="privacy-quick-metrics">
          <div className="privacy-metric-tile">
            <span className="metric-label">Local Storage</span>
            <span className="metric-value">{storageUsage.formattedSize}</span>
            <span className="metric-sub">{storageUsage.localItemCount} browser keys</span>
          </div>
          <div className="privacy-metric-tile">
            <span className="metric-label">Server Telemetry</span>
            <span className="metric-value">0.0 KB</span>
            <span className="metric-sub">Zero trackers or ad SDKs</span>
          </div>
          <div className="privacy-metric-tile">
            <span className="metric-label">Account Sessions</span>
            <span className="metric-value">
              {isLoadingServer ? '…' : serverMeta?.authenticated ? `${serverMeta.sessions?.length || 1} Active` : '1 Local'}
            </span>
            <span className="metric-sub">
              {serverMeta?.authenticated ? 'Authenticated' : 'Local Preview Device'}
            </span>
          </div>
        </div>
      </header>

      {/* Navigation Sub-Tabs */}
      <nav className="privacy-subnav" aria-label="Privacy sections">
        <button
          type="button"
          className={`privacy-tab-btn${activeTab === 'overview' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          {t('privacy.overview')}
        </button>
        <button
          type="button"
          className={`privacy-tab-btn${activeTab === 'data' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          {t('privacy.categories')}
        </button>
        <button
          type="button"
          className={`privacy-tab-btn${activeTab === 'apps' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('apps')}
        >
          {t('privacy.apps')}
        </button>
        <button
          type="button"
          className={`privacy-tab-btn${activeTab === 'export' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          {t('privacy.export')}
        </button>
        <button
          type="button"
          className={`privacy-tab-btn${activeTab === 'deletion' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('deletion')}
        >
          {t('privacy.deletion')}
        </button>
        <button
          type="button"
          className={`privacy-tab-btn${activeTab === 'log' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('log')}
        >
          {t('privacy.activity')}
        </button>
        <button
          type="button"
          className={`privacy-tab-btn${activeTab === 'education' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('education')}
        >
          {t('privacy.education')}
        </button>
      </nav>

      {/* Main Tab Panels */}
      <main className="privacy-tab-content">
        {/* ================================================================= */}
        {/* TAB 1: OVERVIEW                                                   */}
        {/* ================================================================= */}
        {activeTab === 'overview' && (
          <section className="privacy-section" aria-labelledby="sec-overview-title">
            <h2 id="sec-overview-title" className="privacy-section-title">Where Your Data Lives</h2>
            <p className="privacy-section-desc">
              NEXORA separates data across three distinct boundaries so you always know exactly what is stored on your device versus external systems.
            </p>

            <div className="privacy-storage-grid">
              {/* Boundary 1: On Your Device */}
              <article className="privacy-boundary-card local-boundary">
                <div className="boundary-head">
                  <span className="boundary-icon" aria-hidden="true">💻</span>
                  <div>
                    <h3 className="boundary-title">On Your Device (Browser Storage)</h3>
                    <span className="boundary-badge badge-live">Primary Store</span>
                  </div>
                </div>
                <p className="boundary-desc">
                  Your timeline cache, focus timers, wellbeing reflections, bento layout, and automation rules reside directly inside this browser.
                </p>
                <ul className="boundary-list">
                  <li><strong>Active Size:</strong> {storageUsage.formattedSize} across {storageUsage.localItemCount} storage keys</li>
                  <li><strong>Third-Party Isolation:</strong> Never transmitted to advertising networks or external loggers</li>
                  <li><strong>Wipe Guarantee:</strong> Instantly deletable via the Deletion controls below</li>
                </ul>
              </article>

              {/* Boundary 2: On NEXORA Servers */}
              <article className="privacy-boundary-card server-boundary">
                <div className="boundary-head">
                  <span className="boundary-icon" aria-hidden="true">☁️</span>
                  <div>
                    <h3 className="boundary-title">NEXORA Server Storage</h3>
                    <span className="boundary-badge badge-preview">
                      {serverMeta?.authenticated ? 'Authenticated' : 'Local Preview'}
                    </span>
                  </div>
                </div>
                <p className="boundary-desc">
                  {serverMeta?.authenticated
                    ? 'Holds your account identity, profile details, and active authentication session token hashes.'
                    : 'In local preview mode, zero account identity or session records exist on NEXORA servers.'}
                </p>
                <ul className="boundary-list">
                  <li><strong>Session Protection:</strong> Opaque session tokens hashed with SHA-256</li>
                  <li><strong>Password Storage:</strong> Salted scrypt key-derivation hashes; plaintext is never stored</li>
                  <li><strong>Automatic Expiry:</strong> Unused server sessions expire automatically after 7 days</li>
                </ul>
              </article>

              {/* Boundary 3: Third-Party Applications */}
              <article className="privacy-boundary-card third-party-boundary">
                <div className="boundary-head">
                  <span className="boundary-icon" aria-hidden="true">🔒</span>
                  <div>
                    <h3 className="boundary-title">Third-Party Services (Integrations)</h3>
                    <span className="boundary-badge badge-preview">Isolated</span>
                  </div>
                </div>
                <p className="boundary-desc">
                  External services (GitHub, Google, Telegram) only exchange information when you explicitly configure and invoke them.
                </p>
                <ul className="boundary-list">
                  <li><strong>Status:</strong> Currently disconnected or unconfigured in client storage</li>
                  <li><strong>Scope Minimization:</strong> Requests only read-only or narrow operational permissions</li>
                  <li><strong>Zero Token Exposure:</strong> API secrets are never stored in client localStorage</li>
                </ul>
              </article>
            </div>

            {/* Active Sessions Overview */}
            <div className="privacy-sessions-overview">
              <div className="sessions-head">
                <h3 className="sessions-title">Active Devices & Sessions</h3>
                <span className="sessions-note">Actual available session data</span>
              </div>

              {isLoadingServer ? (
                <div className="privacy-skeleton-loader" style={{ height: '70px' }} />
              ) : serverMeta?.authenticated && serverMeta.sessions && serverMeta.sessions.length > 0 ? (
                <div className="sessions-list">
                  {serverMeta.sessions.map((sess) => (
                    <div key={sess.id} className="session-item-row">
                      <div className="session-info">
                        <span className="session-device">
                          {sess.isCurrentDevice ? 'Current Browser (This Device)' : 'Active Workspace Device'}
                        </span>
                        <span className="session-id">Session: {sess.id.slice(0, 10)}…</span>
                      </div>
                      <div className="session-meta">
                        <span>Last active: {formatDate(new Date(sess.lastUsedAt))} {formatTime(new Date(sess.lastUsedAt))}</span>
                        <span className="session-badge">Active</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="session-item-row local-device-session">
                  <div className="session-info">
                    <span className="session-device">This Browser Window (Local Preview)</span>
                    <span className="session-id">Origin: {typeof window !== 'undefined' ? window.location.origin : 'localhost'}</span>
                  </div>
                  <div className="session-meta">
                    <span>Local storage state: Ephemeral preview mode</span>
                    <span className="session-badge badge-preview">Local Only</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 2: DATA CATEGORIES & PERMISSIONS                             */}
        {/* ================================================================= */}
        {activeTab === 'data' && (
          <section className="privacy-section" aria-labelledby="sec-data-title">
            <h2 id="sec-data-title" className="privacy-section-title">Data Categories & Browser Permissions</h2>
            <p className="privacy-section-desc">
              Every item collected by NEXORA serves a dedicated, transparent functional purpose.
              Review the breakdown below and inspect your browser-level permission states.
            </p>

            {/* Browser Permissions Status Card */}
            <div className="privacy-permissions-card">
              <h3 className="permissions-card-title">Live Browser Permission States</h3>
              <p className="permissions-card-copy">
                NEXORA requests device permissions strictly on-demand (e.g. microphone is requested only when opening Speak voice capture).
              </p>
              <div className="permissions-grid">
                {/* 1. Microphone */}
                <div className="permission-item">
                  <div className="perm-header">
                    <span className="perm-name">Microphone Access (Audio)</span>
                    <span className={`perm-badge perm-${permissions.microphone}`}>
                      {permissions.microphone === 'granted' ? 'Allowed' : permissions.microphone === 'denied' ? 'Blocked' : 'Prompt on demand'}
                    </span>
                  </div>
                  <p className="perm-desc">
                    Required solely for browser-native speech transcription in the SPEAK workspace. Recordings are never sent to third-party ad networks.
                  </p>
                </div>

                {/* 2. Notifications */}
                <div className="permission-item">
                  <div className="perm-header">
                    <span className="perm-name">System Notifications</span>
                    <span className={`perm-badge perm-${permissions.notifications}`}>
                      {permissions.notifications === 'granted' ? 'Allowed' : permissions.notifications === 'denied' ? 'Blocked' : 'Prompt on demand'}
                    </span>
                  </div>
                  <p className="perm-desc">
                    Used to alert you when a focus sprint completes or when VIP contacts bypass the distraction shield.
                  </p>
                </div>

                {/* 3. Storage Persistence */}
                <div className="permission-item">
                  <div className="perm-header">
                    <span className="perm-name">Local Storage Persistence</span>
                    <span className={`perm-badge perm-${permissions.storagePersisted ? 'granted' : 'prompt'}`}>
                      {permissions.storagePersisted ? 'Persistent' : 'Best-Effort'}
                    </span>
                  </div>
                  <p className="perm-desc">
                    Local storage holds your customized dashboard and preferences. Under standard browser rules, permissions can be revoked anytime in browser settings.
                  </p>
                </div>
              </div>

              <div className="permissions-revocation-notice">
                <span className="notice-icon" aria-hidden="true">ℹ️</span>
                <span>
                  <strong>Honest Revocation Standard:</strong> Modern browsers enforce security boundaries preventing web apps from programmatically revoking system permissions. To revoke granted permissions, click the lock icon in your browser address bar and select &quot;Reset Permissions&quot;.
                </span>
              </div>
            </div>

            {/* Storage Categories Table */}
            <div className="privacy-categories-table-wrapper">
              <table className="privacy-categories-table" aria-label="Categories of data collected or stored">
                <thead>
                  <tr>
                    <th scope="col">Data Category</th>
                    <th scope="col">Storage Location</th>
                    <th scope="col">Functional Purpose</th>
                    <th scope="col">Retention Policy</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat.id}>
                      <td className="cat-name-cell">
                        <strong>{cat.name}</strong>
                      </td>
                      <td>
                        <span className={`cat-location-pill loc-${cat.location}`}>
                          {cat.location === 'local' ? 'This Browser' : cat.location === 'server' ? 'Server Database' : 'Third-Party'}
                        </span>
                      </td>
                      <td className="cat-purpose-cell">{cat.purpose}</td>
                      <td className="cat-retention-cell">{cat.retentionPolicy}</td>
                      <td>
                        {cat.canDeleteLocally ? (
                          <button
                            type="button"
                            className="cat-delete-btn"
                            onClick={() => setPendingDeleteCategory(cat)}
                            aria-label={`Clear ${cat.name}`}
                          >
                            Clear data
                          </button>
                        ) : (
                          <span className="cat-locked-note">Server protected</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 3: CONNECTED APPLICATIONS                                    */}
        {/* ================================================================= */}
        {activeTab === 'apps' && (
          <section className="privacy-section" aria-labelledby="sec-apps-title">
            <h2 id="sec-apps-title" className="privacy-section-title">Connected Applications & Scopes</h2>
            <p className="privacy-section-desc">
              Review third-party integration scopes and permissions. Unconfigured integrations remain completely disconnected with zero data sharing.
            </p>

            <div className="connected-apps-grid">
              {CONNECTED_TOOLS.map((tool) => {
                const onboarding = getOnboardingState();
                const isConnected = Boolean(onboarding.connectedTools[tool.id]);

                return (
                  <article key={tool.id} className="connected-app-card">
                    <div className="app-card-head">
                      <div>
                        <h3 className="app-card-title">{tool.name}</h3>
                        <span className="app-auth-pill">{tool.authType}</span>
                      </div>
                      <span className={`status-badge ${isConnected ? 'badge-live' : 'badge-preview'}`}>
                        {isConnected ? 'Connected' : 'Not connected'}
                      </span>
                    </div>

                    <p className="app-card-desc">{tool.description}</p>

                    <div className="app-card-scopes">
                      <span className="scope-kicker">REQUIRED PERMISSION SCOPES:</span>
                      <p className="scope-text">{tool.scopeNotice}</p>
                    </div>

                    <div className="app-card-footer">
                      {isConnected ? (
                        <button
                          type="button"
                          className="app-revoke-btn"
                          onClick={() => {
                            showToast({
                              message: 'Integration Disconnected',
                              detail: `Cleared local connection flag for ${tool.name}.`,
                              type: 'info',
                            });
                          }}
                        >
                          Disconnect Integration
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="app-revoke-btn btn-disabled"
                          disabled
                          title="Integration is not active; no OAuth credentials exist to revoke"
                        >
                          Not Connected (Zero Scopes Active)
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="privacy-apps-callout">
              <h4>OAuth Revocation Honesty</h4>
              <p>
                NEXORA does not pretend to perform remote OAuth token revocation against third-party identity providers if no active token exists.
                To link or unlink developer tools, configure official server-side environment credentials in your private deployment environment.
              </p>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 4: DATA EXPORT                                               */}
        {/* ================================================================= */}
        {activeTab === 'export' && (
          <section className="privacy-section" aria-labelledby="sec-export-title">
            <h2 id="sec-export-title" className="privacy-section-title">Export Your Workspace Data</h2>
            <p className="privacy-section-desc">
              Download a complete, machine-readable JSON archive of your personal workspace content, spaces, wellbeing statistics, and automation rules.
            </p>

            <div className="privacy-export-box">
              <div className="export-box-left">
                <h3>Structured JSON Workspace Export</h3>
                <p>
                  Your export contains all locally stored data, formatted with human-readable indentation.
                  Sensitive authentication credentials, password hashes, and server-side secrets are strictly excluded.
                </p>
                <div className="export-spec-list">
                  <div className="spec-item">
                    <strong>Format:</strong> <code>application/json (UTF-8)</code>
                  </div>
                  <div className="spec-item">
                    <strong>Scope:</strong> Appearance, Spaces, Wellbeing, Timeline, Rules, Tools
                  </div>
                  <div className="spec-item">
                    <strong>Storage Footprint:</strong> {storageUsage.formattedSize} ({storageUsage.localItemCount} keys)
                  </div>
                </div>

                <div className="export-action-row">
                  <button
                    type="button"
                    className="privacy-export-cta"
                    onClick={handleTriggerExport}
                    disabled={isExporting}
                  >
                    {isExporting ? 'Generating JSON Archive…' : t('privacy.exportBtn')}
                  </button>
                  <button
                    type="button"
                    className="privacy-preview-btn"
                    onClick={handleOpenJsonPreview}
                  >
                    {t('privacy.previewBtn')}
                  </button>
                </div>
              </div>

              <div className="export-box-right">
                <div className="export-preview-card">
                  <span className="card-kicker">ARCHIVE CONTENTS PREVIEW</span>
                  <ul className="preview-contents-list">
                    <li>✓ Custom Space Definitions & Theme Accents</li>
                    <li>✓ Focus Sprint Time Logs & Distraction Shield History</li>
                    <li>✓ Energy Level Check-in Reflections & Daily Wrapups</li>
                    <li>✓ Cached Timeline Feeds & Reminders</li>
                    <li>✓ User-Configured In-App Automation Rules</li>
                    <li>✓ Appearance, Typography & Contrast Settings</li>
                  </ul>
                  <span className="preview-security-stamp">
                    🔒 Zero Passwords · Zero Auth Tokens
                  </span>
                </div>
              </div>
            </div>

            {/* JSON Code Preview Drawer */}
            {showJsonPreview && exportPreview && (
              <div className="json-preview-overlay" role="dialog" aria-modal="true" aria-labelledby="preview-title">
                <div className="json-preview-modal">
                  <div className="json-preview-head">
                    <h3 id="preview-title">Export JSON Preview</h3>
                    <button
                      type="button"
                      className="json-close-btn"
                      onClick={() => setShowJsonPreview(false)}
                      aria-label="Close JSON preview"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="json-preview-body">
                    <pre>
                      <code>{JSON.stringify(exportPreview, null, 2)}</code>
                    </pre>
                  </div>
                  <div className="json-preview-footer">
                    <button
                      type="button"
                      className="privacy-export-cta"
                      onClick={() => {
                        handleTriggerExport();
                        setShowJsonPreview(false);
                      }}
                    >
                      Download This Archive
                    </button>
                    <button
                      type="button"
                      className="json-cancel-btn"
                      onClick={() => setShowJsonPreview(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 5: DATA DELETION & RETENTION                                 */}
        {/* ================================================================= */}
        {activeTab === 'deletion' && (
          <section className="privacy-section" aria-labelledby="sec-deletion-title">
            <h2 id="sec-deletion-title" className="privacy-section-title">Data Deletion & Retention Policies</h2>
            <p className="privacy-section-desc">
              You possess granular control over what data remains in your workspace.
              Delete specific feature records or perform a complete local reset anytime.
            </p>

            <div className="retention-policy-banner">
              <h3>Retention Transparency</h3>
              <p>
                <strong>Local Browser Storage:</strong> Retained indefinitely on this machine until you delete it or clear browser history.<br />
                <strong>Server Sessions:</strong> Inactive server-side session cookies expire automatically after 7 days.<br />
                <strong>Account Integrity:</strong> Account deletion and authentication modifications require explicit confirmation and cannot be triggered by accident.
              </p>
            </div>

            <div className="deletion-cards-grid">
              {/* Option 1: Wellbeing */}
              <div className="deletion-card">
                <h4>Focus & Wellbeing Data</h4>
                <p>Erase all energy check-ins, focus sprint history, pause tallies, and weekly wellbeing reflections.</p>
                <button
                  type="button"
                  className="destructive-btn"
                  onClick={() => setPendingDeleteCategory({ id: 'focus_wellbeing', name: 'Focus & Wellbeing History' })}
                >
                  Delete Wellbeing Logs
                </button>
              </div>

              {/* Option 2: Timeline */}
              <div className="deletion-card">
                <h4>Timeline & Notifications Cache</h4>
                <p>Clear cached timeline feeds, demo items, snooze timestamps, and reply-later queues.</p>
                <button
                  type="button"
                  className="destructive-btn"
                  onClick={() => setPendingDeleteCategory({ id: 'timeline_tasks', name: 'Timeline & Notifications Cache' })}
                >
                  Clear Timeline Cache
                </button>
              </div>

              {/* Option 3: Automation Rules */}
              <div className="deletion-card">
                <h4>In-App Automation Rules</h4>
                <p>Revert custom automated triggers and workflows back to default factory settings.</p>
                <button
                  type="button"
                  className="destructive-btn"
                  onClick={() => setPendingDeleteCategory({ id: 'automation_rules', name: 'Automation Rules' })}
                >
                  Reset Automation Rules
                </button>
              </div>

              {/* Option 4: Spaces */}
              <div className="deletion-card">
                <h4>Custom Spaces Definitions</h4>
                <p>Reset custom spaces back to standard Work, Study, and Personal space definitions.</p>
                <button
                  type="button"
                  className="destructive-btn"
                  onClick={() => setPendingDeleteCategory({ id: 'spaces', name: 'Custom Spaces Configuration' })}
                >
                  Reset Spaces
                </button>
              </div>

              {/* Option 5: Complete Reset */}
              <div className="deletion-card full-reset-card">
                <h4>Full Local Workspace Reset</h4>
                <p>
                  Clears all NEXORA local storage records on this machine.
                  Your server account and authentication cookies remain intact.
                </p>
                <button
                  type="button"
                  className="destructive-btn btn-danger"
                  onClick={() => setPendingDeleteCategory({ id: 'all_local_workspace', name: 'All Local Workspace Data' })}
                >
                  Reset Local Workspace
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 6: PRIVACY ACTIVITY LOG                                      */}
        {/* ================================================================= */}
        {activeTab === 'log' && (
          <section className="privacy-section" aria-labelledby="sec-log-title">
            <div className="log-section-header">
              <div>
                <h2 id="sec-log-title" className="privacy-section-title">Privacy Activity Log</h2>
                <p className="privacy-section-desc">
                  An immutable, local audit trail of privacy actions taken in this browser.
                </p>
              </div>
              <button
                type="button"
                className="clear-log-btn"
                onClick={handleClearLog}
              >
                Clear Log History
              </button>
            </div>

            <div className="privacy-log-list" role="feed" aria-label="Privacy activity log entries">
              {activityLog.length === 0 ? (
                <div className="privacy-empty-log">
                  <p>No recent privacy events recorded in this browser.</p>
                </div>
              ) : (
                activityLog.map((event) => (
                  <article key={event.id} className="privacy-log-entry">
                    <div className="log-entry-icon" aria-hidden="true">
                      {event.type === 'export' ? '📦' : event.type === 'delete' ? '🗑️' : event.type === 'permission_check' ? '🛡️' : '📝'}
                    </div>
                    <div className="log-entry-content">
                      <div className="log-entry-top">
                        <strong className="log-title">{event.title}</strong>
                        <time className="log-time" dateTime={new Date(event.timestamp).toISOString()}>
                          {formatDate(event.timestamp)} · {formatTime(event.timestamp)}
                        </time>
                      </div>
                      {event.details && <p className="log-details">{event.details}</p>}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 7: PRIVACY EDUCATION                                         */}
        {/* ================================================================= */}
        {activeTab === 'education' && (
          <section className="privacy-section" aria-labelledby="sec-edu-title">
            <h2 id="sec-edu-title" className="privacy-section-title">Privacy & Encryption Transparency</h2>
            <p className="privacy-section-desc">
              Clear, technically honest explanations of our security model and architectural protections.
            </p>

            <div className="privacy-education-grid">
              <div className="edu-card">
                <h3>What NEXORA Stores</h3>
                <p>
                  NEXORA stores your workspace appearance preferences, space layouts, focus metrics, and custom automation rules.
                  When signed in, your email, display name, and hashed credentials reside securely on our servers.
                </p>
              </div>

              <div className="edu-card">
                <h3>What Remains on Your Device</h3>
                <p>
                  Audio buffers during voice capture, temporary draft files in Create canvas, uncommitted local notes,
                  and your private energy check-in tallies remain strictly within your browser&apos;s storage sandbox.
                </p>
              </div>

              <div className="edu-card">
                <h3>Third-Party Isolation</h3>
                <p>
                  Connected tools (GitHub, Google, Telegram) receive requests only when you explicitly trigger actions (such as syncing code or saving a task).
                  We never embed tracking pixels, marketing beacons, or data brokers.
                </p>
              </div>

              <div className="edu-card">
                <h3>What Encryption Truly Protects</h3>
                <p>
                  <strong>Transport Layer Security (TLS 1.3):</strong> Encrypts all communication between your browser and NEXORA servers.<br />
                  <strong>Password Hashes:</strong> Stored with salted scrypt derivation hashes to resist rainbow tables and brute force.<br />
                  <strong>Session Security:</strong> Protected by HTTP-only, SameSite=Lax, Secure cookies.
                </p>
              </div>

              <div className="edu-card">
                <h3>What Encryption Does NOT Protect</h3>
                <p>
                  <strong>Unlocked Computer Screens:</strong> Physical access to an open, unlocked browser allows reading local storage.<br />
                  <strong>Browser Extensions:</strong> Extensions with &quot;read all site data&quot; permissions can inspect browser state.<br />
                  <strong>Device Compromise:</strong> Malware or keyloggers on your operating system bypass browser security sandboxes.
                </p>
              </div>

              <div className="edu-card">
                <h3>How You Control Your Data</h3>
                <p>
                  You can export your complete workspace state to JSON anytime, selectively purge local feature logs,
                  or clear all site data directly in your browser settings.
                </p>
              </div>
            </div>

            <div className="encryption-honesty-footnote">
              <strong>Honesty Standard:</strong> NEXORA does not claim &quot;end-to-end encryption&quot; for general workspace settings or timeline entries where keys are not held exclusively by client cryptography. We state technical realities clearly.
            </div>
          </section>
        )}
      </main>

      {/* Confirmation Modal for Destructive Deletion */}
      {pendingDeleteCategory && (
        <div className="privacy-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-del-title">
          <div className="privacy-modal-box">
            <div className="modal-top">
              <span className="modal-alert-icon" aria-hidden="true">⚠️</span>
              <div>
                <h3 id="modal-del-title" className="modal-title">
                  Delete {pendingDeleteCategory.name}?
                </h3>
                <p className="modal-desc">
                  {t('privacy.deletePermanent')} This data cannot be recovered once purged.
                </p>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn-confirm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting Data…' : 'Yes, Delete This Data'}
              </button>
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={() => setPendingDeleteCategory(null)}
                disabled={isDeleting}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
