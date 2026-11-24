'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getFocusState, isPathShielded, formatFocusTime } from '@/lib/focus-manager';
import { triggerHaptic, isHapticsEnabled, setHapticsEnabled, isHapticsSupported } from '@/lib/haptics';

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [focusState, setFocusState] = useState(getFocusState());
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(false);
  const moreDrawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHapticsOn(isHapticsEnabled());

    const handleFocusChange = () => setFocusState(getFocusState());
    const handleHapticChange = (e: Event) => {
      const custom = e as CustomEvent<{ enabled: boolean }>;
      if (custom.detail) setHapticsOn(custom.detail.enabled);
    };

    window.addEventListener('nexora-focus-change', handleFocusChange);
    window.addEventListener('nexora-haptics-change', handleHapticChange);

    const interval = setInterval(() => {
      setFocusState(getFocusState());
    }, 1000);

    return () => {
      window.removeEventListener('nexora-focus-change', handleFocusChange);
      window.removeEventListener('nexora-haptics-change', handleHapticChange);
      clearInterval(interval);
    };
  }, []);

  // Trap escape key inside More drawer
  useEffect(() => {
    if (!moreDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moreDrawerOpen]);

  const handleNavClick = (e: React.MouseEvent, href: string) => {
    triggerHaptic('tap');
    if (focusState.isActive && isPathShielded(href, focusState)) {
      e.preventDefault();
      // Shielded: open distraction shield alert
      window.dispatchEvent(new CustomEvent('nexora-shield-alert', { detail: { targetPath: href } }));
    }
  };

  const handleOpenSearch = () => {
    triggerHaptic('tap');
    window.dispatchEvent(new CustomEvent('nexora-open-palette'));
  };

  const handleToggleFocus = () => {
    triggerHaptic('tap');
    // Open focus timer modal or navigate home to focus
    window.dispatchEvent(new CustomEvent('nexora-open-focus-modal'));
  };

  const handleToggleHaptics = (enabled: boolean) => {
    setHapticsEnabled(enabled);
    setHapticsOn(enabled);
    if (enabled) triggerHaptic('success');
  };

  const isCurrent = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      <nav
        className="mobile-bottom-nav"
        aria-label="Mobile primary navigation"
        role="navigation"
      >
        {/* 1. Overview */}
        <Link
          href="/"
          className={`mobile-nav-item${isCurrent('/') ? ' is-active' : ''}`}
          aria-current={isCurrent('/') ? 'page' : undefined}
          onClick={(e) => handleNavClick(e, '/')}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </span>
          <span className="mobile-nav-label">Overview</span>
        </Link>

        {/* 2. Focus */}
        <button
          type="button"
          className={`mobile-nav-item${focusState.isActive ? ' is-focus-active' : ''}`}
          onClick={handleToggleFocus}
          aria-label={focusState.isActive ? `Focus Sprint active: ${formatFocusTime(focusState.remainingSeconds)}` : 'Focus Sprint'}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <span className="mobile-nav-label">
            {focusState.isActive ? formatFocusTime(focusState.remainingSeconds) : 'Focus'}
          </span>
        </button>

        {/* 3. Connect */}
        <Link
          href="/connect"
          className={`mobile-nav-item${isCurrent('/connect') ? ' is-active' : ''}${
            focusState.isActive && isPathShielded('/connect', focusState) ? ' is-shielded' : ''
          }`}
          aria-current={isCurrent('/connect') ? 'page' : undefined}
          onClick={(e) => handleNavClick(e, '/connect')}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span className="mobile-nav-label">Connect</span>
        </Link>

        {/* 4. Think */}
        <Link
          href="/think"
          className={`mobile-nav-item${isCurrent('/think') ? ' is-active' : ''}${
            focusState.isActive && isPathShielded('/think', focusState) ? ' is-shielded' : ''
          }`}
          aria-current={isCurrent('/think') ? 'page' : undefined}
          onClick={(e) => handleNavClick(e, '/think')}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M8 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1 2.1-2.5 2.5v2m0 2.5v.1" />
            </svg>
          </span>
          <span className="mobile-nav-label">Think</span>
        </Link>

        {/* 5. Mobile Search Trigger (Cmd+K) */}
        <button
          type="button"
          className="mobile-nav-item"
          onClick={handleOpenSearch}
          aria-label="Open Command Search (Cmd+K)"
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <span className="mobile-nav-label">Search</span>
        </button>

        {/* 6. More Drawer */}
        <button
          type="button"
          className={`mobile-nav-item${moreDrawerOpen ? ' is-active' : ''}`}
          onClick={() => {
            triggerHaptic('tap');
            setMoreDrawerOpen(open => !open);
          }}
          aria-label="More workspaces and settings"
          aria-expanded={moreDrawerOpen}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
              <circle cx="5" cy="12" r="1.5" />
            </svg>
          </span>
          <span className="mobile-nav-label">More</span>
        </button>
      </nav>

      {/* More Slide-Up Sheet */}
      {moreDrawerOpen && (
        <>
          <div
            className="mobile-drawer-backdrop"
            onClick={() => setMoreDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={moreDrawerRef}
            className="mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More Workspaces and Settings"
          >
            <div className="mobile-sheet-header">
              <div className="mobile-sheet-drag-handle" aria-hidden="true" />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>More Workspaces & Tools</h2>
                <button
                  type="button"
                  onClick={() => setMoreDrawerOpen(false)}
                  className="mobile-sheet-close"
                  aria-label="Close more sheet"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="mobile-sheet-content">
              {/* Other Primary Workspaces */}
              <div className="mobile-sheet-grid">
                {[
                  { href: '/build', label: 'Build', desc: 'Code workspace & safe preview', icon: '⌘' },
                  { href: '/create', label: 'Create', desc: 'Visual studio & canvas', icon: '✎' },
                  { href: '/speak', label: 'Speak', desc: 'Voice interactive assistant', icon: '🎙' },
                  { href: '/discover', label: 'Discover', desc: 'Research & citation feed', icon: '🔍' },
                  { href: '/social', label: 'Social', desc: 'Private calm community', icon: '👥' },
                  { href: '/share-target', label: 'Share Target', desc: 'Receive Android shares', icon: '📲' },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="mobile-sheet-item"
                    onClick={(e) => {
                      setMoreDrawerOpen(false);
                      handleNavClick(e, item.href);
                    }}
                  >
                    <span className="mobile-sheet-icon" aria-hidden="true">{item.icon}</span>
                    <div className="mobile-sheet-info">
                      <span className="mobile-sheet-title">{item.label}</span>
                      <small className="mobile-sheet-desc">{item.desc}</small>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Mobile Haptic Feedback Setting */}
              <div className="mobile-sheet-setting">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label htmlFor="haptics-toggle" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                      Haptic Feedback
                    </label>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--muted, #6b7264)', lineHeight: 1.35 }}>
                      Gentle tactile vibration on taps and actions.
                    </p>
                  </div>
                  <input
                    id="haptics-toggle"
                    type="checkbox"
                    checked={hapticsOn}
                    onChange={(e) => handleToggleHaptics(e.target.checked)}
                    disabled={!isHapticsSupported()}
                    style={{ width: '1.25rem', height: '1.25rem', accentColor: 'var(--accent, #4f6b15)', cursor: 'pointer' }}
                  />
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.725rem', color: 'var(--muted, #6b7264)', lineHeight: 1.35 }}>
                  <strong>Notice:</strong> Supported on Android Chrome via <code>navigator.vibrate</code>. iOS Safari does not support web vibration. Automatically silenced when reduced motion is preferred.
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
