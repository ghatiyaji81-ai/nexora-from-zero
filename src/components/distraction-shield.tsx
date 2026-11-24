'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  FocusSessionState,
  formatFocusTime,
  grantTemporaryPass,
  stopFocusSession,
} from '@/lib/focus-manager';

interface DistractionShieldProps {
  pathname: string;
  focusState: FocusSessionState;
}

export function DistractionShield({ pathname, focusState }: DistractionShieldProps) {
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  // Focus trap & Escape handling
  useEffect(() => {
    // Focus first actionable button on mount
    primaryBtnRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        router.push(focusState.chosenSpace || '/');
        return;
      }

      // Trap focus inside modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusState.chosenSpace, router]);

  const handleReturn = () => {
    router.push(focusState.chosenSpace || '/');
  };

  const handleAllowTemporary = () => {
    grantTemporaryPass(pathname);
  };

  const handleEndSession = () => {
    stopFocusSession();
  };

  return (
    <div
      className="distraction-shield-backdrop"
      role="presentation"
      onClick={e => {
        // Prevent background clicks from doing anything unintentional
        if (e.target === e.currentTarget) {
          handleReturn();
        }
      }}
    >
      <div
        ref={modalRef}
        className="distraction-shield-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shield-title"
      >
        <div className="shield-badge-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>

        <div className="shield-timer-pill">
          <span className="shield-pulse-dot" />
          <span>{formatFocusTime(focusState.remainingSeconds)} remaining</span>
        </div>

        <h2 id="shield-title" className="shield-title">
          Distraction Shield Active
        </h2>

        <p className="shield-description">
          You are currently in a dedicated attention session for{' '}
          <strong>{focusState.chosenSpaceLabel}</strong>. This space is shielded to protect your focus from context switching.
        </p>

        <div className="shield-actions">
          <button
            ref={primaryBtnRef}
            type="button"
            className="button button-primary shield-action-btn"
            onClick={handleReturn}
          >
            Return to {focusState.chosenSpaceLabel}
            <span aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            className="button button-secondary shield-action-btn"
            onClick={handleAllowTemporary}
          >
            Allow this space for 5m
          </button>

          <button
            type="button"
            className="button button-quiet shield-action-btn"
            onClick={handleEndSession}
          >
            End Focus Session
          </button>
        </div>

        <p className="shield-escape-hint">
          Press <kbd>Esc</kbd> to return to {focusState.chosenSpaceLabel}
        </p>
      </div>
    </div>
  );
}
