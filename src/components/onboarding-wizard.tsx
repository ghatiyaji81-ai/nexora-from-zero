'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  CONNECTED_TOOLS,
  ConnectedToolId,
  getOnboardingState,
  OnboardingState,
  ROLE_PRESETS,
  UserRole,
  completeOnboarding,
} from '@/lib/onboarding-config';
import { showToast } from '@/lib/toast-manager';

export function OnboardingWizard() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedRole, setSelectedRole] = useState<UserRole>('developer');
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [toolConnections, setToolConnections] = useState<Record<ConnectedToolId, boolean>>({
    github: false,
    google: false,
    telegram: false,
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Check first-run status on mount & listen for manual trigger event
  useEffect(() => {
    const state = getOnboardingState();
    const hasDismissed = typeof window !== 'undefined' ? sessionStorage.getItem('nexora-onboarding-dismissed') : null;

    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!state.completed && !hasDismissed) {
      // Delay auto-appearance until after initial page paint and interaction settlement (3500ms)
      timer = setTimeout(() => {
        setIsOpen(true);
      }, 3500);
    }

    const handleOpen = () => {
      setIsOpen(true);
      setStep(1);
    };

    window.addEventListener('nexora-open-onboarding', handleOpen);
    return () => {
      window.removeEventListener('nexora-open-onboarding', handleOpen);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Manage focus trap and keyboard ESC
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial focus on dialog
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const firstFocusable = dialogRef.current.querySelector<HTMLElement>('button, input');
        firstFocusable?.focus();
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, step]);

  const handleDismiss = () => {
    setIsOpen(false);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('nexora-onboarding-dismissed', 'true');
    }
  };

  const handleFinish = () => {
    completeOnboarding({
      role: selectedRole,
      isDemoMode,
      connectedTools: toolConnections,
    });

    setIsOpen(false);

    const preset = ROLE_PRESETS[selectedRole];
    showToast({
      message: `Workspace configured for ${preset.label}`,
      detail: `Theme: ${preset.theme} · Pins: ${preset.pinnedRoutes.join(', ')} · ${
        isDemoMode ? 'Demo mode enabled' : 'Clean workspace'
      }`,
      type: 'success',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="onboarding-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-wizard-title"
      >
        {/* Wizard Topline & Progress */}
        <div className="onboarding-topbar">
          <div className="onboarding-progress-indicator">
            <span className={`step-dot ${step >= 1 ? 'is-active' : ''}`}>1</span>
            <span className="step-line" />
            <span className={`step-dot ${step >= 2 ? 'is-active' : ''}`}>2</span>
            <span className="step-line" />
            <span className={`step-dot ${step >= 3 ? 'is-active' : ''}`}>3</span>
          </div>

          <button
            type="button"
            className="onboarding-close-btn"
            onClick={handleDismiss}
            aria-label="Skip onboarding for now"
            title="Skip for now"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Wizard Body: Step 1 - Role Selection */}
        {step === 1 && (
          <div className="onboarding-step-body">
            <div className="onboarding-header">
              <span className="card-kicker">WELCOME TO NEXORA · STEP 1 OF 3</span>
              <h2 id="onboarding-wizard-title">Choose your primary focus</h2>
              <p className="onboarding-subtitle">
                Select a role to tailor your workspace layout, sidebar pins, default theme, and shortcut bindings.
              </p>
            </div>

            <div className="role-card-grid" role="radiogroup" aria-label="Select your focus role">
              {(Object.keys(ROLE_PRESETS) as UserRole[]).map((roleKey) => {
                const preset = ROLE_PRESETS[roleKey];
                const isSelected = selectedRole === roleKey;
                return (
                  <div
                    key={preset.id}
                    className={`role-option-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedRole(preset.id)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setSelectedRole(preset.id);
                      }
                    }}
                    tabIndex={0}
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`${preset.label} role: ${preset.summary}`}
                  >
                    <div className="role-option-topline">
                      <span className="role-option-kicker">{preset.kicker}</span>
                      <span className="role-radio-marker">
                        {isSelected ? '✓' : ''}
                      </span>
                    </div>

                    <h3 className="role-option-title">{preset.label}</h3>
                    <p className="role-option-summary">{preset.summary}</p>

                    <div className="role-option-meta">
                      <div className="role-meta-item">
                        <span className="role-meta-label">Theme:</span>
                        <span className="role-meta-value">{preset.theme} ({preset.accent})</span>
                      </div>
                      <div className="role-meta-item">
                        <span className="role-meta-label">Pinned:</span>
                        <span className="role-meta-value">{preset.highlightedModules.join(', ')}</span>
                      </div>
                      <div className="role-meta-item">
                        <span className="role-meta-label">Shortcuts:</span>
                        <span className="role-meta-value">{preset.shortcutsFocus}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Wizard Body: Step 2 - Connect Your Tools */}
        {step === 2 && (
          <div className="onboarding-step-body">
            <div className="onboarding-header">
              <span className="card-kicker">INTEGRATIONS · STEP 2 OF 3</span>
              <h2 id="onboarding-wizard-title">Connect your tools</h2>
              <p className="onboarding-subtitle">
                Link external developer and productivity tools. Unconfigured services remain securely disconnected.
              </p>
            </div>

            <div className="tools-list">
              {CONNECTED_TOOLS.map((tool) => {
                const isConnected = toolConnections[tool.id];
                return (
                  <div key={tool.id} className="tool-card">
                    <div className="tool-card-main">
                      <div className="tool-card-heading">
                        <h4>{tool.name}</h4>
                        {/* Strictly honest status: Not connected */}
                        <span className="tool-status-pill tool-not-connected">
                          {isConnected ? 'Connected' : 'Not connected'}
                        </span>
                        <span className="tool-auth-tag">{tool.authType}</span>
                      </div>
                      <p className="tool-desc">{tool.description}</p>
                      <span className="tool-notice">{tool.scopeNotice}</span>
                    </div>

                    <div className="tool-card-actions">
                      <button
                        type="button"
                        className={`tool-connect-btn ${isConnected ? 'is-connected-btn' : ''}`}
                        onClick={() => {
                          setToolConnections((prev) => ({
                            ...prev,
                            [tool.id]: !prev[tool.id],
                          }));
                          showToast({
                            message: !isConnected
                              ? `OAuth mock connection initialized for ${tool.name}`
                              : `Disconnected ${tool.name}`,
                            detail: !isConnected
                              ? 'Production OAuth connects with your server credentials in .env.local.'
                              : undefined,
                            type: 'info',
                          });
                        }}
                      >
                        {isConnected ? 'Disconnect' : `Connect ${tool.name}`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Wizard Body: Step 3 - Demo Mode & Confirmation */}
        {step === 3 && (
          <div className="onboarding-step-body">
            <div className="onboarding-header">
              <span className="card-kicker">READY TO LAUNCH · STEP 3 OF 3</span>
              <h2 id="onboarding-wizard-title">Choose your workspace mode</h2>
              <p className="onboarding-subtitle">
                Explore with pre-populated sample items (zero signup needed) or begin with an empty workspace.
              </p>
            </div>

            <div className="mode-selection-grid">
              <div
                className={`mode-card ${isDemoMode ? 'is-selected' : ''}`}
                onClick={() => setIsDemoMode(true)}
                tabIndex={0}
                role="radio"
                aria-checked={isDemoMode}
              >
                <div className="mode-badge">Recommended</div>
                <h3>Demo Mode (No signup required)</h3>
                <p>
                  Loads demonstration tasks, calendar events, unread items, and research notes. Perfect for immediate inspection.
                </p>
                <div className="mode-perks">
                  <span>✓ 7 realistic sample timeline events</span>
                  <span>✓ Ready-to-test Focus Room with Web Audio</span>
                  <span>✓ Immediate browser evaluation</span>
                </div>
              </div>

              <div
                className={`mode-card ${!isDemoMode ? 'is-selected' : ''}`}
                onClick={() => setIsDemoMode(false)}
                tabIndex={0}
                role="radio"
                aria-checked={!isDemoMode}
              >
                <div className="mode-badge mode-badge-alt">Clean slate</div>
                <h3>Start Fresh</h3>
                <p>
                  Zero sample items. A completely pristine canvas ready for your real data and projects.
                </p>
                <div className="mode-perks">
                  <span>✓ Empty timeline feed</span>
                  <span>✓ Standard clean databases</span>
                  <span>✓ Ready for manual data entry</span>
                </div>
              </div>
            </div>

            <div className="onboarding-summary-box">
              <span className="summary-title">Configuration Summary</span>
              <div className="summary-row">
                <span>Role:</span> <strong>{ROLE_PRESETS[selectedRole].label}</strong>
              </div>
              <div className="summary-row">
                <span>Theme:</span> <strong>{ROLE_PRESETS[selectedRole].theme} ({ROLE_PRESETS[selectedRole].accent})</strong>
              </div>
              <div className="summary-row">
                <span>Pinned spaces:</span> <strong>{ROLE_PRESETS[selectedRole].pinnedRoutes.join(', ')}</strong>
              </div>
              <div className="summary-row">
                <span>Mode:</span> <strong>{isDemoMode ? 'Demo mode (Sample data)' : 'Clean canvas'}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Footer Controls */}
        <div className="onboarding-footer">
          <button
            type="button"
            className="onboarding-btn-secondary"
            onClick={step === 1 ? handleDismiss : () => setStep((prev) => (prev - 1) as 1 | 2)}
          >
            {step === 1 ? 'Skip for now' : 'Back'}
          </button>

          <div className="onboarding-footer-right">
            {step < 3 ? (
              <button
                type="button"
                className="onboarding-btn-primary"
                onClick={() => setStep((prev) => (prev + 1) as 2 | 3)}
              >
                <span>Continue</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="onboarding-btn-primary onboarding-btn-finish"
                onClick={handleFinish}
              >
                <span>Launch Workspace</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

