'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  ToastItem,
  dismissToast,
  getActiveToasts,
  triggerUndo,
} from '@/lib/toast-manager';

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pausedToastIds, setPausedToastIds] = useState<Set<string>>(new Set());
  const toastTimersRef = useRef<Map<string, { timeoutId: NodeJS.Timeout; remainingMs: number; startedAt: number }>>(
    new Map()
  );

  useEffect(() => {
    function updateToasts(nextList: ToastItem[]) {
      setToasts(nextList);

      // Manage timers for each toast
      const activeIds = new Set(nextList.map(t => t.id));

      // Clean timers for removed toasts
      for (const [id, timer] of toastTimersRef.current.entries()) {
        if (!activeIds.has(id)) {
          clearTimeout(timer.timeoutId);
          toastTimersRef.current.delete(id);
        }
      }

      // Start timers for new toasts
      for (const t of nextList) {
        if (!toastTimersRef.current.has(t.id) && t.durationMs > 0) {
          const timeoutId = setTimeout(() => {
            dismissToast(t.id);
          }, t.durationMs);

          toastTimersRef.current.set(t.id, {
            timeoutId,
            remainingMs: t.durationMs,
            startedAt: Date.now(),
          });
        }
      }
    }

    updateToasts(getActiveToasts());

    function handleToastChange(e: Event) {
      const customEvent = e as CustomEvent<ToastItem[]>;
      if (customEvent.detail) {
        updateToasts(customEvent.detail);
      } else {
        updateToasts(getActiveToasts());
      }
    }

    window.addEventListener('nexora-toast-change', handleToastChange);
    return () => {
      window.removeEventListener('nexora-toast-change', handleToastChange);
      for (const timer of toastTimersRef.current.values()) {
        clearTimeout(timer.timeoutId);
      }
      toastTimersRef.current.clear();
    };
  }, []);

  function handlePauseToast(id: string) {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer.timeoutId);
      const elapsed = Date.now() - timer.startedAt;
      const remaining = Math.max(500, timer.remainingMs - elapsed);
      toastTimersRef.current.set(id, {
        ...timer,
        remainingMs: remaining,
      });
      setPausedToastIds(prev => new Set(prev).add(id));
    }
  }

  function handleResumeToast(id: string) {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      const timeoutId = setTimeout(() => {
        dismissToast(id);
      }, timer.remainingMs);

      toastTimersRef.current.set(id, {
        timeoutId,
        remainingMs: timer.remainingMs,
        startedAt: Date.now(),
      });

      setPausedToastIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (toasts.length === 0) return null;

  return (
    <div
      className="toast-container"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map(toast => {
        const isUndo = Boolean(toast.undoAction);
        const isPaused = pausedToastIds.has(toast.id);

        return (
          <div
            key={toast.id}
            className={`toast-item toast-${toast.type}${isPaused ? ' is-paused' : ''}`}
            role="status"
            aria-live="polite"
            onMouseEnter={() => handlePauseToast(toast.id)}
            onMouseLeave={() => handleResumeToast(toast.id)}
            onFocus={() => handlePauseToast(toast.id)}
            onBlur={() => handleResumeToast(toast.id)}
          >
            {/* Progress countdown bar for undo toasts */}
            {isUndo && (
              <div
                className="toast-progress-bar"
                style={{
                  animationDuration: `${toast.durationMs}ms`,
                  animationPlayState: isPaused ? 'paused' : 'running',
                }}
                aria-hidden="true"
              />
            )}

            <div className="toast-content-row">
              <div className="toast-icon-wrapper" aria-hidden="true">
                {toast.type === 'success' ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : isUndo ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                )}
              </div>

              <div className="toast-text-column">
                <span className="toast-message">{toast.message}</span>
                {toast.detail && <small className="toast-detail">{toast.detail}</small>}
              </div>

              {isUndo && (
                <button
                  type="button"
                  className="toast-undo-btn"
                  onClick={() => triggerUndo(toast.id)}
                  aria-label={`${toast.undoLabel || 'Undo'} this action (or press ⌘Z)`}
                >
                  {toast.undoLabel || 'Undo'}
                </button>
              )}

              <button
                type="button"
                className="toast-dismiss-btn"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
