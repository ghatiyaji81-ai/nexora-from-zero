'use client';

import React, { useEffect, useState } from 'react';
import {
  addRule,
  deleteRule,
  getActivityLogs,
  getRules,
  Rule,
  RuleActivityLogEntry,
  runMorningRoutineWorkflow,
  runWindDownWorkflow,
  testRuleDryRun,
  toggleRule,
  TriggerType,
  ActionType,
  clearActivityLogs,
} from '@/lib/rules-engine';
import { showToast } from '@/lib/toast-manager';
import { t } from '@/lib/i18n-strings';

export function RulesEngineCard() {
  const [rules, setRules] = useState<Rule[]>(() => getRules());
  const [logs, setLogs] = useState<RuleActivityLogEntry[]>(() => getActivityLogs());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // New Rule form state
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleDesc, setNewRuleDesc] = useState('');
  const [newTrigger, setNewTrigger] = useState<TriggerType>('focus_started');
  const [newAction, setNewAction] = useState<ActionType>('switch_space');
  const [newActionSpace, setNewActionSpace] = useState('work');

  const refreshRules = () => setRules(getRules());
  const refreshLogs = () => setLogs(getActivityLogs());

  useEffect(() => {
    refreshRules();
    refreshLogs();

    const handleRulesChange = () => refreshRules();
    const handleLogsChange = () => refreshLogs();

    window.addEventListener('nexora-rules-change', handleRulesChange);
    window.addEventListener('nexora-rules-log-change', handleLogsChange);

    return () => {
      window.removeEventListener('nexora-rules-change', handleRulesChange);
      window.removeEventListener('nexora-rules-log-change', handleLogsChange);
    };
  }, []);

  const handleToggle = (id: string) => {
    const updated = toggleRule(id);
    if (updated) {
      showToast({ message: `${updated.name} ${updated.enabled ? 'enabled' : 'disabled'}` });
    }
  };

  const handleDryRun = (id: string) => {
    const res = testRuleDryRun(id);
    showToast({ message: res.message });
  };

  const handleDelete = (id: string) => {
    deleteRule(id);
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim()) return;

    addRule({
      name: newRuleName.trim(),
      description: newRuleDesc.trim() || 'Custom user automation rule',
      enabled: true,
      trigger: { type: newTrigger },
      action: {
        type: newAction,
        params: newAction === 'switch_space' ? { spaceId: newActionSpace } : undefined,
      },
    });

    setNewRuleName('');
    setNewRuleDesc('');
    setShowCreateModal(false);
    showToast({ message: 'New rule created' });
  };

  return (
    <article className="rules-engine-card" aria-labelledby="rules-engine-heading">
      <div className="rules-header">
        <div>
          <span className="card-kicker">AUTOMATION & ROUTING</span>
          <h3 id="rules-engine-heading" className="rules-title">
            {t('rules.title')}
          </h3>
          <p className="rules-subtitle">{t('rules.subtitle')}</p>
        </div>
        <div className="rules-header-actions">
          <button
            type="button"
            className="rules-action-btn rules-log-btn"
            onClick={() => setShowLogsModal(true)}
          >
            📋 Log ({logs.length})
          </button>
          <button
            type="button"
            className="rules-action-btn rules-create-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + {t('rules.createRule')}
          </button>
        </div>
      </div>

      {/* Honest scheduled notice */}
      <div className="rules-schedule-notice" role="note">
        <span aria-hidden="true">ℹ</span>
        <span>{t('rules.scheduledNotice')}</span>
      </div>

      {/* 1. One-Click In-App Workflows */}
      <div className="rules-workflows-section">
        <span className="workflows-label">Calm One-Click Sequences:</span>
        <div className="workflows-btn-row">
          <button
            type="button"
            className="workflow-btn workflow-morning"
            onClick={runMorningRoutineWorkflow}
          >
            <span className="workflow-icon" aria-hidden="true">🌅</span>
            <div className="workflow-text">
              <strong>{t('rules.morningRoutine')}</strong>
              <small>Work space · 25m Focus</small>
            </div>
          </button>

          <button
            type="button"
            className="workflow-btn workflow-winddown"
            onClick={runWindDownWorkflow}
          >
            <span className="workflow-icon" aria-hidden="true">🌙</span>
            <div className="workflow-text">
              <strong>{t('rules.windDown')}</strong>
              <small>Personal space · Quiet hours</small>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Rules List */}
      <div className="rules-list-section" role="region" aria-label="Active rules list">
        <span className="workflows-label">When & Then Rules:</span>
        <div className="rules-list">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`rule-item-row ${rule.enabled ? 'is-enabled' : 'is-disabled'}`}
            >
              <div className="rule-main-col">
                <div className="rule-topline">
                  <strong className="rule-name">{rule.name}</strong>
                  <span className={`rule-status-badge ${rule.enabled ? 'badge-active' : 'badge-paused'}`}>
                    {rule.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
                <p className="rule-description">{rule.description}</p>
                <div className="rule-chips">
                  <span className="rule-chip chip-trigger">
                    When: <code>{rule.trigger.type.replace(/_/g, ' ')}</code>
                  </span>
                  <span className="rule-chip-arrow" aria-hidden="true">→</span>
                  <span className="rule-chip chip-action">
                    Then: <code>{rule.action.type.replace(/_/g, ' ')}</code>
                  </span>
                </div>
              </div>

              <div className="rule-controls-col">
                <button
                  type="button"
                  className="rule-btn rule-dryrun-btn"
                  onClick={() => handleDryRun(rule.id)}
                  title="Simulate rule execution without altering state"
                >
                  Test
                </button>

                <button
                  type="button"
                  className={`rule-toggle-btn ${rule.enabled ? 'is-on' : 'is-off'}`}
                  onClick={() => handleToggle(rule.id)}
                  aria-label={`${rule.enabled ? 'ON' : 'OFF'}: ${rule.enabled ? 'disable' : 'enable'} rule ${rule.name}`}
                >
                  {rule.enabled ? 'ON' : 'OFF'}
                </button>

                <button
                  type="button"
                  className="rule-btn rule-delete-btn"
                  onClick={() => handleDelete(rule.id)}
                  title="Delete rule (undoable for 10s)"
                  aria-label={`Delete rule: ${rule.name}`}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Create Rule Modal */}
      {showCreateModal && (
        <div className="rules-modal-overlay" role="presentation">
          <div
            className="rules-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-rule-title"
          >
            <h4 id="create-rule-title">Create New Automation Rule</h4>
            <form onSubmit={handleCreateRule} className="create-rule-form">
              <label>
                <span>Rule Name</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Focus Silence"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="rules-input"
                />
              </label>

              <label>
                <span>Description</span>
                <input
                  type="text"
                  placeholder="What should this rule accomplish?"
                  value={newRuleDesc}
                  onChange={(e) => setNewRuleDesc(e.target.value)}
                  className="rules-input"
                />
              </label>

              <div className="form-two-col">
                <label>
                  <span>When (Trigger)</span>
                  <select
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value as TriggerType)}
                    className="rules-select"
                  >
                    <option value="focus_started">Focus session started</option>
                    <option value="focus_ended">Focus session ended</option>
                    <option value="notification_arrived">Notification arrived</option>
                    <option value="quiet_hours_begin">Quiet hours begin</option>
                    <option value="space_switched">Space switched</option>
                  </select>
                </label>

                <label>
                  <span>Then (Action)</span>
                  <select
                    value={newAction}
                    onChange={(e) => setNewAction(e.target.value as ActionType)}
                    className="rules-select"
                  >
                    <option value="switch_space">Switch Space</option>
                    <option value="start_focus">Start Focus Sprint</option>
                    <option value="stop_focus">Conclude Focus</option>
                    <option value="route_notification_to_digest">Route to Daily Digest</option>
                    <option value="unmute_notifications">Prioritize Alert</option>
                  </select>
                </label>
              </div>

              {newAction === 'switch_space' && (
                <label>
                  <span>Target Space</span>
                  <select
                    value={newActionSpace}
                    onChange={(e) => setNewActionSpace(e.target.value)}
                    className="rules-select"
                  >
                    <option value="work">Work Space</option>
                    <option value="study">Study Space</option>
                    <option value="personal">Personal Space</option>
                  </select>
                </label>
              )}

              <div className="rules-modal-actions">
                <button
                  type="button"
                  className="rules-btn-cancel"
                  onClick={() => setShowCreateModal(false)}
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="rules-btn-submit">
                  {t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Activity Log Modal */}
      {showLogsModal && (
        <div className="rules-modal-overlay" role="presentation">
          <div
            className="rules-modal-dialog rules-log-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-dialog-title"
          >
            <div className="rules-log-header">
              <h4 id="log-dialog-title">{t('rules.activityLog')}</h4>
              <button
                type="button"
                className="rules-action-btn"
                onClick={clearActivityLogs}
                aria-label="Clear all activity logs"
              >
                Clear
              </button>
            </div>

            <div className="rules-log-list" role="feed" aria-label="Automation execution history">
              {logs.length === 0 ? (
                <p className="empty-log-note">No automation activity recorded yet.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="log-entry-item">
                    <div className="log-topline">
                      <strong>{log.ruleName}</strong>
                      {log.isDryRun && <span className="dryrun-tag">Dry Run</span>}
                      <span className="log-time">{log.timeDisplay}</span>
                    </div>
                    <p className="log-summary">{log.summary}</p>
                  </div>
                ))
              )}
            </div>

            <div className="rules-modal-actions">
              <button
                type="button"
                className="rules-btn-cancel"
                onClick={() => setShowLogsModal(false)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
