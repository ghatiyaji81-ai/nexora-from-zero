'use client';

import React, { useEffect, useState } from 'react';
import {
  getShortcutsConfig,
  POPULAR_ALTERNATIVES,
  saveShortcut,
  resetShortcuts,
  ShortcutConfig,
} from '@/lib/shortcut-config';
import { showToast } from '@/lib/toast-manager';

export interface ShortcutGroup {
  title: string;
  items: {
    keys: string[];
    description: string;
    actionKey?: keyof ShortcutConfig;
  }[];
}

interface ShortcutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutModal({ isOpen, onClose }: ShortcutModalProps) {
  const [config, setConfig] = useState<ShortcutConfig>(() => getShortcutsConfig());
  const [editingAction, setEditingAction] = useState<keyof ShortcutConfig | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setConfig(getShortcutsConfig());

    const handleShortcutsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<ShortcutConfig>;
      if (customEvent.detail) setConfig(customEvent.detail);
    };

    window.addEventListener('nexora-shortcuts-changed', handleShortcutsChanged);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (editingAction) {
          setEditingAction(null);
        } else {
          onClose();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('nexora-shortcuts-changed', handleShortcutsChanged);
    };
  }, [isOpen, onClose, editingAction]);

  if (!isOpen) return null;

  const focusKeys = config.focusToggle.display.split('+');
  const dyslexicKeys = config.dyslexicToggle.display.split('+');

  const shortcutGroups: ShortcutGroup[] = [
    {
      title: 'Navigation ("G then ...")',
      items: [
        { keys: ['G', 'H'], description: 'Go to Overview' },
        { keys: ['G', 'F'], description: 'Go to Focus Room' },
        { keys: ['G', 'C'], description: 'Go to Connect' },
        { keys: ['G', 'T'], description: 'Go to Think' },
        { keys: ['G', 'S'], description: 'Go to Speak' },
        { keys: ['G', 'R'], description: 'Go to Create' },
        { keys: ['G', 'B'], description: 'Go to Build' },
        { keys: ['G', 'D'], description: 'Go to Discover' },
        { keys: ['G', 'A'], description: 'Go to Social' },
        { keys: ['G', 'P'], description: 'Open Space Profiles' },
      ],
    },
    {
      title: 'Global Controls',
      items: [
        { keys: ['⌘', 'K'], description: 'Open Command Palette' },
        { keys: ['?'], description: 'Open Keyboard Shortcuts' },
        { keys: ['Esc'], description: 'Close any open dialog or preview' },
        { keys: ['Space'], description: 'Run quick action in peek preview' },
        { keys: ['Enter'], description: 'Navigate to focused destination' },
        { keys: ['⌘', 'Z'], description: 'Undo last destructive action (10s toast)' },
        { keys: ['Shift', 'F10'], description: 'Open contextual menu on focused item' },
      ],
    },
    {
      title: 'Focus Mode & Attention (Remappable)',
      items: [
        {
          keys: focusKeys,
          description: 'Toggle 25m Focus Session on current space',
          actionKey: 'focusToggle',
        },
        { keys: ['G', 'F'], description: 'Open Focus Room and start timer' },
        { keys: ['Esc'], description: 'Dismiss Distraction Shield & return to focused space' },
      ],
    },
    {
      title: 'Workspace Appearance (Remappable)',
      items: [
        {
          keys: dyslexicKeys,
          description: 'Toggle OpenDyslexic accessible font',
          actionKey: 'dyslexicToggle',
        },
        { keys: ['T'], description: 'Open appearance settings' },
        { keys: ['Tab'], description: 'Focus next interactive element' },
        { keys: ['Shift', 'Tab'], description: 'Focus previous element' },
      ],
    },
  ];

  return (
    <div
      className="shortcut-backdrop"
      role="presentation"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="shortcut-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-title"
      >
        <div className="shortcut-header">
          <div>
            <h2 id="shortcut-title" className="shortcut-title">
              Keyboard Shortcuts
            </h2>
            <p className="shortcut-subtitle">Quick navigation and customizable hotkeys anywhere in NEXORA</p>
          </div>
          <button
            type="button"
            className="icon-button shortcut-close-btn"
            onClick={onClose}
            aria-label="Close shortcuts dialog"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
              <path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="shortcut-grid">
          {shortcutGroups.map(group => (
            <div key={group.title} className="shortcut-group">
              <h3 className="shortcut-group-title">{group.title}</h3>
              <div className="shortcut-list">
                {group.items.map(item => (
                  <div key={item.description} className="shortcut-row">
                    <span className="shortcut-desc">{item.description}</span>
                    <div className="shortcut-keys">
                      {item.keys.map((k, idx) => (
                        <React.Fragment key={idx}>
                          <kbd className="shortcut-kbd">{k}</kbd>
                          {idx < item.keys.length - 1 && item.keys.length === 2 && group.title.includes('G then') ? (
                            <span className="shortcut-then">then</span>
                          ) : idx < item.keys.length - 1 ? (
                            <span className="shortcut-plus">+</span>
                          ) : null}
                        </React.Fragment>
                      ))}

                      {item.actionKey && (
                        <button
                          type="button"
                          className="remap-shortcut-btn"
                          aria-label={`Remap ${item.description}`}
                          onClick={() => setEditingAction(editingAction === item.actionKey ? null : item.actionKey ?? null)}
                        >
                          {editingAction === item.actionKey ? 'Cancel' : 'Remap'}
                        </button>
                      )}
                    </div>

                    {item.actionKey && editingAction === item.actionKey && (
                      <div className="remap-options-box" role="region" aria-label="Choose new hotkey combo">
                        <span className="remap-prompt-label">Select non-clashing shortcut:</span>
                        <div className="remap-buttons-row">
                          {POPULAR_ALTERNATIVES[item.actionKey].map((alt) => (
                            <button
                              key={alt.display}
                              type="button"
                              className={`remap-choice-btn ${config[item.actionKey!].display === alt.display ? 'is-active' : ''}`}
                              onClick={() => {
                                saveShortcut(item.actionKey!, alt);
                                setEditingAction(null);
                                showToast({ message: `Shortcut updated to ${alt.display}` });
                              }}
                            >
                              {alt.display}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcut-footer">
          <button
            type="button"
            className="shortcut-reset-btn"
            onClick={() => {
              resetShortcuts();
              showToast({ message: 'Restored default shortcuts (Alt+Shift+F, Alt+Shift+D)' });
            }}
          >
            Reset to defaults
          </button>
          <span>Press <kbd className="shortcut-kbd">Esc</kbd> to dismiss</span>
        </div>
      </section>
    </div>
  );
}
