'use client';

import React, { useEffect, useState } from 'react';
import { showToast, showUndoToast } from '@/lib/toast-manager';
import { t } from '@/lib/i18n-strings';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PwaController() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if dismissed before in this session
    const isDismissed = sessionStorage.getItem('nexora_pwa_dismissed') === 'true';

    // 1. Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      if (!isDismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 2. Register Service Worker with Security Guardrails
    if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // If a worker is already waiting, trigger update toast
          if (reg.waiting) {
            setWaitingWorker(reg.waiting);
            setUpdateAvailable(true);
          }

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setWaitingWorker(newWorker);
                  setUpdateAvailable(true);
                }
              });
            }
          });
        })
        .catch(() => {
          // Graceful fallback if SW registration fails
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // 3. Online / Offline listeners
    const handleOnline = () => {
      setIsOffline(false);
      showToast({
        message: 'Connection restored. Cloud sync active.',
        type: 'success',
        durationMs: 4000,
      });
    };

    const handleOffline = () => {
      setIsOffline(true);
      showToast({
        message: 'Offline mode active. Local notes and focus tools remain accessible.',
        type: 'neutral',
        durationMs: 5000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    setShowInstallBanner(false);
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      showToast({
        message: 'NEXORA installed to home screen.',
        type: 'success',
        durationMs: 4000,
      });
    }
    setInstallPrompt(null);
  };

  const handleDismissBanner = () => {
    setShowInstallBanner(false);
    sessionStorage.setItem('nexora_pwa_dismissed', 'true');
  };

  const handleApplyUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    setUpdateAvailable(false);
  };

  return (
    <>
      {/* Update Available Notification Banner / Toast */}
      {updateAvailable && (
        <aside
          role="status"
          aria-live="polite"
          className="pwa-update-bar"
          style={{
            position: 'fixed',
            bottom: '1.25rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            backgroundColor: 'var(--surface-raised, #ffffff)',
            color: 'var(--ink, #20231f)',
            border: '1px solid var(--line, #e3e2d8)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            borderRadius: '0.875rem',
            padding: '0.75rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            maxWidth: 'calc(100vw - 2rem)',
            width: 'max-content',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
            <span aria-hidden="true">✨</span>
            <span>Update available for NEXORA</span>
          </div>
          <button
            type="button"
            onClick={handleApplyUpdate}
            className="pwa-refresh-btn"
            style={{
              backgroundColor: 'var(--ink, #20231f)',
              color: 'var(--canvas, #f4f3ed)',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.4rem 0.85rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </aside>
      )}

      {/* Gentle Install Prompt Banner */}
      {showInstallBanner && installPrompt && (
        <aside
          role="region"
          aria-label="Install NEXORA"
          className="pwa-install-banner"
          style={{
            position: 'fixed',
            top: '4.5rem',
            right: '1.5rem',
            zIndex: 9000,
            backgroundColor: 'var(--surface-raised, #ffffff)',
            color: 'var(--ink, #20231f)',
            border: '1px solid var(--line, #e3e2d8)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
            borderRadius: '1rem',
            padding: '1rem 1.25rem',
            maxWidth: '360px',
            width: 'calc(100vw - 3rem)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>
                Install NEXORA App
              </h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--ink-soft, #4a5240)', margin: '0 0 0.75rem 0', lineHeight: 1.4 }}>
                Add to your home screen or desktop for rapid distraction-free offline access.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismissBanner}
              aria-label="Dismiss install prompt"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--ink-soft, #4a5240)',
                fontSize: '1.1rem',
                cursor: 'pointer',
                padding: '0.2rem',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleInstallClick}
              style={{
                flex: 1,
                backgroundColor: 'var(--ink, #20231f)',
                color: 'var(--canvas, #f4f3ed)',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Install
            </button>
            <button
              type="button"
              onClick={handleDismissBanner}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--ink-soft, #4a5240)',
                border: '1px solid var(--line, #e3e2d8)',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Not now
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
