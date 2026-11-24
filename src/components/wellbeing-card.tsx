'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  canCheckinToday,
  DailyWrapup,
  deleteAllLocalData,
  EnergyCheckinEntry,
  EnergyLevel,
  exportAllLocalData,
  getDailyWrapup,
  getEnergyHistory,
  getWeeklyFocusReport,
  recordEnergyCheckin,
  WeeklyFocusReport,
} from '@/lib/wellbeing-manager';
import { showToast } from '@/lib/toast-manager';
import { t } from '@/lib/i18n-strings';

export function WellbeingCard() {
  const [checkinStatus, setCheckinStatus] = useState(() => canCheckinToday());
  const [activeEntry, setActiveEntry] = useState<EnergyCheckinEntry | null>(() => {
    const history = getEnergyHistory();
    return history[0] || null;
  });
  const [dailyWrapup, setDailyWrapup] = useState<DailyWrapup | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyFocusReport>(() => getWeeklyFocusReport());
  const [isSkipped, setIsSkipped] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const refreshWellbeing = () => {
    setCheckinStatus(canCheckinToday());
    const history = getEnergyHistory();
    setActiveEntry(history[0] || null);
    getDailyWrapup().then(setDailyWrapup);
    setWeeklyReport(getWeeklyFocusReport());
  };

  useEffect(() => {
    refreshWellbeing();

    const handleUpdate = () => refreshWellbeing();
    window.addEventListener('nexora-wellbeing-change', handleUpdate);
    window.addEventListener('nexora-focus-state-change', handleUpdate);

    return () => {
      window.removeEventListener('nexora-wellbeing-change', handleUpdate);
      window.removeEventListener('nexora-focus-state-change', handleUpdate);
    };
  }, []);

  const handleSelectLevel = (level: EnergyLevel) => {
    const entry = recordEnergyCheckin(level);
    setActiveEntry(entry);
    setCheckinStatus(canCheckinToday());

    showToast({
      message: `Energy noted: ${entry.headline}`,
      detail: entry.suggestion,
      type: 'info',
    });
  };

  const handleExportData = () => {
    const jsonStr = exportAllLocalData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexora-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast({
      message: 'Local data exported successfully',
      type: 'success',
    });
  };

  const handleDeleteData = () => {
    deleteAllLocalData();
    setShowDeleteConfirm(false);
    refreshWellbeing();

    showToast({
      message: t('wellbeing.deletedSuccess'),
      detail: 'All browser data was deleted. Refresh to reinitialize clean workspace.',
      type: 'undo',
      undoLabel: 'Refresh',
      undoAction: () => window.location.reload(),
    });
  };

  return (
    <article className="wellbeing-card" aria-labelledby="wellbeing-heading">
      {/* Header */}
      <div className="wellbeing-header">
        <div>
          <span className="card-kicker">WELLBEING & INTENTION</span>
          <h3 id="wellbeing-heading" className="wellbeing-title">
            Energy Check-in & Focus Reflection
          </h3>
        </div>
        <span className="wellbeing-privacy-pill" title="All data stored strictly in local browser storage">
          100% Local & Private
        </span>
      </div>

      {/* 1. Energy Check-in Section */}
      <div className="wellbeing-energy-section">
        {checkinStatus.allowed && !isSkipped ? (
          <div className="energy-prompt-box">
            <div className="energy-prompt-top">
              <h4>{t('wellbeing.energyTitle')}</h4>
              <button
                type="button"
                className="energy-skip-btn"
                onClick={() => setIsSkipped(true)}
                aria-label="Skip for now: energy check-in"
              >
                {t('common.skip')}
              </button>
            </div>
            <p className="energy-prompt-desc">
              How is your energy right now? (At most twice daily, suggestions tailor to your pace).
            </p>
            <div className="energy-btn-group" role="group" aria-label="Energy level options">
              <button
                type="button"
                className="energy-option-btn energy-low"
                onClick={() => handleSelectLevel('low')}
              >
                <span className="energy-icon" aria-hidden="true">🔋</span>
                <span className="energy-label">Low</span>
                <small>Gentle pace</small>
              </button>

              <button
                type="button"
                className="energy-option-btn energy-steady"
                onClick={() => handleSelectLevel('steady')}
              >
                <span className="energy-icon" aria-hidden="true">⚡</span>
                <span className="energy-label">Steady</span>
                <small>Balanced flow</small>
              </button>

              <button
                type="button"
                className="energy-option-btn energy-high"
                onClick={() => handleSelectLevel('high')}
              >
                <span className="energy-icon" aria-hidden="true">🚀</span>
                <span className="energy-label">High</span>
                <small>Deep clarity</small>
              </button>
            </div>
          </div>
        ) : activeEntry ? (
          <div className="energy-recommendation-box">
            <div className="energy-rec-header">
              <span className="energy-rec-tag">Current Energy: {activeEntry.headline}</span>
              <span className="energy-rec-time">{activeEntry.period === 'morning' ? 'Morning check-in' : 'Afternoon check-in'}</span>
            </div>
            <p className="energy-rec-body">{activeEntry.suggestion}</p>
            <Link href={activeEntry.targetRoute} className="energy-rec-link">
              <span>Open suggested space</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : null}
      </div>

      {/* 2. Weekly Report & Daily Wrap-up */}
      <div className="wellbeing-reports-grid">
        <div className="wellbeing-stat-card">
          <span className="stat-card-title">{t('wellbeing.dailyWrapup')}</span>
          <small className="stat-card-badge" title="Derived exclusively from real in-app focus sessions">Real focus data</small>
          <div className="stat-card-number">
            {dailyWrapup ? `${dailyWrapup.focusMinutes}m` : '0m'}
          </div>
          <p className="stat-card-copy">
            {dailyWrapup ? dailyWrapup.gentleSummary : t('wellbeing.gentleTone')}
          </p>
        </div>

        <div className="wellbeing-stat-card">
          <span className="stat-card-title">{t('wellbeing.weeklyReport')}</span>
          <small className="stat-card-badge" title="Derived exclusively from real in-app focus sessions">Real focus data</small>
          <div className="stat-card-number">
            {weeklyReport.totalFocusMinutes}m
          </div>
          <p className="stat-card-copy">
            {weeklyReport.gentleSummary}
          </p>
        </div>
      </div>

      {/* 3. Local Data Privacy & Controls */}
      <div className="wellbeing-privacy-footer">
        <span className="privacy-note">
          Nexora never transmits your thoughts or focus logs. Your work lives exclusively on your machine.
        </span>

        <div className="privacy-actions">
          <button
            type="button"
            className="privacy-btn privacy-export-btn"
            onClick={handleExportData}
            title={t('wellbeing.exportDesc')}
          >
            ↓ {t('wellbeing.exportData')}
          </button>

          <button
            type="button"
            className="privacy-btn privacy-delete-btn"
            onClick={() => setShowDeleteConfirm(true)}
            title={t('wellbeing.deleteDesc')}
          >
            ⚠ {t('wellbeing.deleteData')}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="wellbeing-confirm-overlay" role="presentation">
          <div
            className="wellbeing-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
          >
            <h4 id="confirm-delete-title">Delete all local data?</h4>
            <p>
              This will erase all your local spaces, focus history, timeline items, and customized themes from this browser.
              This action cannot be undone.
            </p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="confirm-cancel-btn"
                onClick={() => setShowDeleteConfirm(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="confirm-delete-action-btn"
                onClick={handleDeleteData}
              >
                Yes, erase all my local data
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
