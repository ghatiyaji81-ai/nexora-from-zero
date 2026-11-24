'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PreviewWireframe, PreviewVariant } from '@/components/preview-wireframe';
import { getWorkspaceStatus } from '@/lib/workspace-status';
import {
  getFocusState,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  stopFocusSession,
  toggleDistractionShield,
} from '@/lib/focus-manager';
import { switchSpace } from '@/lib/spaces-manager';
import { triggerTopUndo } from '@/lib/toast-manager';

export interface CommandItem {
  id: string;
  label: string;
  detail: string;
  category: 'Recent' | 'Actions' | 'Spaces' | 'Settings';
  href?: string;
  onExecute?: () => void;
  keywords?: string[];
  icon: string;
  previewVariant: PreviewVariant;
  statusText?: string;
}

const ALL_COMMANDS: Omit<CommandItem, 'statusText'>[] = [
  // Quick Actions
  {
    id: 'act-focus',
    label: 'Start 25m Focus Session',
    detail: 'Immediately start the 25-minute attention timer',
    category: 'Actions',
    href: '/#focus',
    keywords: ['timer', 'pomodoro', 'work', 'attention', 'clock', 'start'],
    icon: '⏱',
    previewVariant: 'focus',
  },
  {
    id: 'act-focus-shield',
    label: 'Toggle Distraction Shield (Focus mode)',
    detail: 'Toggle distraction shielding on unselected workspaces',
    category: 'Actions',
    keywords: ['shield', 'distraction', 'block', 'focus', 'lock'],
    icon: '🛡',
    previewVariant: 'focus',
  },
  {
    id: 'act-focus-pause',
    label: 'Pause / Resume Focus Session',
    detail: 'Toggle pause on the active focus timer',
    category: 'Actions',
    keywords: ['pause', 'resume', 'timer', 'hold', 'continue'],
    icon: '⏸',
    previewVariant: 'focus',
  },
  {
    id: 'act-focus-end',
    label: 'End Focus Session',
    detail: 'Complete focus session and restore all workspaces',
    category: 'Actions',
    keywords: ['stop', 'end', 'finish', 'cancel', 'reset', 'focus'],
    icon: '⏹',
    previewVariant: 'focus',
  },
  {
    id: 'act-note',
    label: 'Open Think (Intelligence space)',
    detail: 'Navigate to Think workspace for notes and AI conversations',
    category: 'Actions',
    href: '/think',
    keywords: ['note', 'ai', 'write', 'document', 'prompt', 'intelligence'],
    icon: '✦',
    previewVariant: 'think',
  },
  {
    id: 'act-message',
    label: 'Open Connect (Messages & groups)',
    detail: 'Navigate to Connect messaging workspace',
    category: 'Actions',
    href: '/connect',
    keywords: ['chat', 'message', 'dm', 'channel', 'contacts', 'talk'],
    icon: '💬',
    previewVariant: 'connect',
  },
  {
    id: 'act-speak',
    label: 'Open Speak (Voice studio)',
    detail: 'Navigate to Speak audio transcription workspace',
    category: 'Actions',
    href: '/speak',
    keywords: ['audio', 'microphone', 'dictate', 'speech', 'voice', 'sound'],
    icon: '🎙',
    previewVariant: 'speak',
  },
  {
    id: 'act-project',
    label: 'Open Create (Design studio)',
    detail: 'Navigate to Create workspace for design projects',
    category: 'Actions',
    href: '/create',
    keywords: ['design', 'image', 'art', 'studio', 'canvas', 'graphics'],
    icon: '▧',
    previewVariant: 'create',
  },
  {
    id: 'act-build',
    label: 'Open Build (Code workspace)',
    detail: 'Navigate to Build code projects and test runner',
    category: 'Actions',
    href: '/build',
    keywords: ['code', 'git', 'terminal', 'offline', 'test', 'compile'],
    icon: '⚡',
    previewVariant: 'build',
  },
  {
    id: 'act-search',
    label: 'Open Discover (Research sources)',
    detail: 'Navigate to Discover document research',
    category: 'Actions',
    href: '/discover',
    keywords: ['search', 'find', 'sources', 'cite', 'research', 'quotes'],
    icon: '🔍',
    previewVariant: 'discover',
  },
  {
    id: 'act-post',
    label: 'Open Social (Activity feed)',
    detail: 'Navigate to Social activity and stories',
    category: 'Actions',
    href: '/social',
    keywords: ['share', 'feed', 'story', 'status', 'social', 'friends'],
    icon: '◎',
    previewVariant: 'social',
  },

  // Spaces (Navigation)
  {
    id: 'space-switch-work',
    label: 'Switch to Work Space',
    detail: 'Engineering, git sync, and build tools (Dark/Cyan)',
    category: 'Spaces',
    keywords: ['space', 'profile', 'work', 'code', 'build'],
    icon: '💼',
    previewVariant: 'build',
  },
  {
    id: 'space-switch-study',
    label: 'Switch to Study Space',
    detail: 'Research, discover, and focus shield (Warm/Amber)',
    category: 'Spaces',
    keywords: ['space', 'profile', 'study', 'research', 'discover'],
    icon: '📚',
    previewVariant: 'discover',
  },
  {
    id: 'space-switch-personal',
    label: 'Switch to Personal Space',
    detail: 'Creative studio, voice, and social drafts (Light/Rose)',
    category: 'Spaces',
    keywords: ['space', 'profile', 'personal', 'create', 'social'],
    icon: '🌿',
    previewVariant: 'create',
  },
  {
    id: 'space-overview',
    label: 'Overview',
    detail: 'Unified dashboard with focus room and product map',
    category: 'Spaces',
    href: '/',
    keywords: ['home', 'dashboard', 'principle'],
    icon: '⌂',
    previewVariant: 'overview',
  },
  {
    id: 'space-focus',
    label: 'Focus Room',
    detail: 'Quiet 25-minute attention timer',
    category: 'Spaces',
    href: '/#focus',
    keywords: ['focus', 'timer', 'clock', 'session'],
    icon: '⏱',
    previewVariant: 'focus',
  },
  {
    id: 'space-connect',
    label: 'Connect',
    detail: 'Direct messaging, groups, and contact lists',
    category: 'Spaces',
    href: '/connect',
    keywords: ['connect', 'chat', 'messages', 'talk'],
    icon: '💬',
    previewVariant: 'connect',
  },
  {
    id: 'space-think',
    label: 'Think',
    detail: 'Multi-model intelligence workspace and document drafting',
    category: 'Spaces',
    href: '/think',
    keywords: ['think', 'ai', 'notes', 'intelligence'],
    icon: '✦',
    previewVariant: 'think',
  },
  {
    id: 'space-speak',
    label: 'Speak',
    detail: 'Web Speech API voice transcription and recordings',
    category: 'Spaces',
    href: '/speak',
    keywords: ['speak', 'voice', 'sound', 'audio'],
    icon: '🎙',
    previewVariant: 'speak',
  },
  {
    id: 'space-create',
    label: 'Create',
    detail: 'Design canvas, document drafting, and asset studio',
    category: 'Spaces',
    href: '/create',
    keywords: ['create', 'design', 'studio', 'art'],
    icon: '▧',
    previewVariant: 'create',
  },
  {
    id: 'space-build',
    label: 'Build',
    detail: 'Offline code workspace, tests, and preview gateway',
    category: 'Spaces',
    href: '/build',
    keywords: ['build', 'code', 'git', 'terminal'],
    icon: '⚡',
    previewVariant: 'build',
  },
  {
    id: 'space-discover',
    label: 'Discover',
    detail: 'Evidence-backed document research and citations',
    category: 'Spaces',
    href: '/discover',
    keywords: ['discover', 'search', 'research'],
    icon: '🔍',
    previewVariant: 'discover',
  },
  {
    id: 'space-social',
    label: 'Social',
    detail: 'Privacy-aware activity feed, stories, and connections',
    category: 'Spaces',
    href: '/social',
    keywords: ['social', 'feed', 'stories'],
    icon: '◎',
    previewVariant: 'social',
  },

  // Settings
  {
    id: 'set-theme-light',
    label: 'Switch to Light Theme',
    detail: 'Parchment and clean paper canvas',
    category: 'Settings',
    keywords: ['theme', 'appearance', 'bright', 'sun', 'light'],
    icon: '☼',
    previewVariant: 'overview',
  },
  {
    id: 'set-theme-warm',
    label: 'Switch to Warm (Eye-Comfort) Theme',
    detail: 'Sepia amber tones to reduce eye fatigue',
    category: 'Settings',
    keywords: ['theme', 'sepia', 'paper', 'amber', 'warm', 'eye', 'comfort'],
    icon: '☕',
    previewVariant: 'overview',
  },
  {
    id: 'set-theme-dark',
    label: 'Switch to Dark Theme',
    detail: 'Quiet deep dark canvas for night sessions',
    category: 'Settings',
    keywords: ['theme', 'night', 'moon', 'black', 'dark'],
    icon: '☽',
    previewVariant: 'overview',
  },
  {
    id: 'set-density-toggle',
    label: 'Toggle Interface Density',
    detail: 'Switch between Comfortable and Compact spacing',
    category: 'Settings',
    keywords: ['density', 'compact', 'spacing', 'comfortable', 'layout'],
    icon: '▤',
    previewVariant: 'overview',
  },
  {
    id: 'set-setup-wizard',
    label: 'Open Setup Wizard (Connect your tools)',
    detail: 'Configure role (Developer/Student/Creator), theme, pins, and tools',
    category: 'Settings',
    keywords: ['setup', 'wizard', 'role', 'onboarding', 'connect', 'tools', 'import', 'demo'],
    icon: '⚡',
    previewVariant: 'overview',
  },
  {
    id: 'set-font-dyslexic',
    label: 'Toggle OpenDyslexic Accessible Font',
    detail: 'Switch between standard typography and dyslexia-friendly letterforms',
    category: 'Settings',
    keywords: ['font', 'dyslexia', 'opendyslexic', 'accessibility', 'typeface', 'reading'],
    icon: 'Aa',
    previewVariant: 'overview',
  },
  {
    id: 'act-shortcuts',
    label: 'Open Keyboard Shortcuts',
    detail: 'View and customize all navigation, focus, and appearance shortcuts',
    category: 'Actions',
    keywords: ['shortcuts', 'hotkeys', 'keyboard', 'cheat sheet', 'help'],
    icon: '⌨',
    previewVariant: 'overview',
  },
  {
    id: 'act-undo',
    label: 'Undo Last Action',
    detail: 'Revert the most recent delete or move within 10 seconds',
    category: 'Actions',
    keywords: ['undo', 'revert', 'restore', 'z'],
    icon: '↺',
    previewVariant: 'overview',
  },
  {
    id: 'space-switcher-open',
    label: 'Open Space Profiles Switcher',
    detail: 'Manage, rename, or switch Work, Study, and Personal spaces',
    category: 'Spaces',
    keywords: ['space', 'profile', 'work', 'study', 'personal', 'switch', 'spaces'],
    icon: '❖',
    previewVariant: 'overview',
  },
];

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return true;
  let qIdx = 0;
  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
    if (t[tIdx] === q[qIdx]) qIdx++;
  }
  return qIdx === q.length;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string>('act-focus');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load recents from localStorage
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('nexora-recent-commands');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setRecentIds(parsed);
        }
      }
    } catch {}
  }, []);

  // Enrich commands with honest status text from workspace-status config
  const commandsWithStatus: CommandItem[] = useMemo(() => {
    return ALL_COMMANDS.map(cmd => {
      const statusKey = cmd.previewVariant.toUpperCase();
      const statusInfo = getWorkspaceStatus(statusKey);
      return {
        ...cmd,
        statusText: statusInfo.statusText,
      };
    });
  }, []);

  // Filtered list
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // If no query, prioritize recents at top
      const recentItems: CommandItem[] = [];
      recentIds.forEach(id => {
        const item = commandsWithStatus.find(c => c.id === id);
        if (item && !recentItems.some(r => r.id === item.id)) {
          recentItems.push({ ...item, category: 'Recent' });
        }
      });

      const nonRecent = commandsWithStatus.filter(
        c => !recentItems.some(r => r.id === c.id)
      );

      return [...recentItems.slice(0, 3), ...nonRecent];
    }

    return commandsWithStatus.filter(cmd => {
      const searchTarget = `${cmd.label} ${cmd.detail} ${cmd.category} ${(cmd.keywords || []).join(' ')}`;
      return fuzzyMatch(searchTarget, q);
    });
  }, [query, recentIds, commandsWithStatus]);

  // Keep active item valid
  useEffect(() => {
    if (filteredCommands.length > 0) {
      if (!filteredCommands.some(c => c.id === activeId)) {
        setActiveId(filteredCommands[0].id);
      }
    }
  }, [filteredCommands, activeId]);

  // Auto focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const activeItem = useMemo(() => {
    return filteredCommands.find(c => c.id === activeId) || filteredCommands[0] || null;
  }, [filteredCommands, activeId]);

  // Execute a command
  const runCommand = (item: CommandItem) => {
    // Record in recents
    try {
      const nextRecents = [item.id, ...recentIds.filter(id => id !== item.id)].slice(0, 5);
      setRecentIds(nextRecents);
      window.localStorage.setItem('nexora-recent-commands', JSON.stringify(nextRecents));
    } catch {}

    // Special setting actions
    if (item.id === 'set-theme-light') {
      document.documentElement.dataset.theme = 'light';
      window.localStorage.setItem('nexora-theme', 'light');
    } else if (item.id === 'set-theme-warm') {
      document.documentElement.dataset.theme = 'warm';
      window.localStorage.setItem('nexora-theme', 'warm');
    } else if (item.id === 'set-theme-dark') {
      document.documentElement.dataset.theme = 'dark';
      window.localStorage.setItem('nexora-theme', 'dark');
    } else if (item.id === 'set-density-toggle') {
      const current = document.documentElement.dataset.density;
      const nextDensity = current === 'compact' ? 'comfortable' : 'compact';
      document.documentElement.dataset.density = nextDensity;
      window.localStorage.setItem('nexora-density', nextDensity);
    } else if (item.id === 'set-setup-wizard') {
      window.dispatchEvent(new CustomEvent('nexora-open-onboarding'));
    } else if (item.id === 'space-switch-work') {
      switchSpace('work');
    } else if (item.id === 'space-switch-study') {
      switchSpace('study');
    } else if (item.id === 'space-switch-personal') {
      switchSpace('personal');
    } else if (item.id === 'act-focus') {
      startFocusSession(window.location.pathname || '/', 25 * 60);
      if (typeof window !== 'undefined' && window.location.pathname === '/') {
        window.dispatchEvent(new CustomEvent('nexora-start-focus'));
      } else {
        router.push('/#focus-start');
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('nexora-start-focus'));
          }
        }, 150);
      }
    } else if (item.id === 'act-focus-shield') {
      toggleDistractionShield();
    } else if (item.id === 'act-focus-pause') {
      const state = getFocusState();
      if (state.isActive) {
        if (state.isPaused) resumeFocusSession();
        else pauseFocusSession();
      }
    } else if (item.id === 'act-focus-end') {
      stopFocusSession();
    } else if (item.id === 'set-font-dyslexic') {
      const currentMode = document.documentElement.dataset.fontMode;
      const nextMode = currentMode === 'dyslexic' ? 'standard' : 'dyslexic';
      document.documentElement.dataset.fontMode = nextMode;
      window.localStorage.setItem('nexora-font-mode', nextMode);
      window.dispatchEvent(new CustomEvent('nexora-appearance-change', { detail: { fontMode: nextMode } }));
    } else if (item.id === 'act-shortcuts') {
      window.dispatchEvent(new CustomEvent('nexora-open-shortcuts'));
    } else if (item.id === 'act-undo') {
      triggerTopUndo();
    } else if (item.id === 'space-switcher-open') {
      window.dispatchEvent(new CustomEvent('nexora-open-space-switcher'));
    } else if (item.onExecute) {
      item.onExecute();
    } else if (item.href) {
      router.push(item.href);
    }

    onClose();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentIndex = filteredCommands.findIndex(c => c.id === activeId);
      const nextIndex = (currentIndex + 1) % filteredCommands.length;
      if (filteredCommands[nextIndex]) {
        setActiveId(filteredCommands[nextIndex].id);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIndex = filteredCommands.findIndex(c => c.id === activeId);
      const prevIndex = (currentIndex - 1 + filteredCommands.length) % filteredCommands.length;
      if (filteredCommands[prevIndex]) {
        setActiveId(filteredCommands[prevIndex].id);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeItem) {
        runCommand(activeItem);
      }
    }
  };

  // Grouped by category
  const groupedSections = useMemo(() => {
    const order: Array<CommandItem['category']> = ['Recent', 'Actions', 'Spaces', 'Settings'];
    const sections: { title: string; items: CommandItem[] }[] = [];

    order.forEach(cat => {
      const items = filteredCommands.filter(c => c.category === cat);
      if (items.length > 0) {
        sections.push({
          title: cat === 'Recent' ? 'RECENT' : cat === 'Actions' ? 'QUICK ACTIONS' : cat === 'Spaces' ? 'WORKSPACES' : 'SETTINGS',
          items,
        });
      }
    });

    return sections;
  }, [filteredCommands]);

  return (
    <div
      className="palette-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="palette-title"
      >
        <h2 className="sr-only" id="palette-title">
          Search workspace actions
        </h2>

        <label className="palette-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path d="m16 16 5 5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search actions…"
            aria-label="Find a workspace action"
          />
          <kbd>ESC</kbd>
        </label>

        <div className="palette-body">
          <div className="palette-list" ref={listRef} role="listbox">
            {groupedSections.length > 0 ? (
              groupedSections.map(section => (
                <div key={section.title} className="palette-section">
                  <p className="palette-section-label">{section.title}</p>
                  {section.items.map(command => {
                    const isSelected = command.id === activeItem?.id;
                    return (
                      <button
                        className={`palette-result ${isSelected ? 'palette-result-active' : ''}`}
                        type="button"
                        key={command.id}
                        onClick={() => runCommand(command)}
                        onMouseEnter={() => setActiveId(command.id)}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span className="palette-result-icon" aria-hidden="true">
                          {command.icon}
                        </span>
                        <span className="palette-result-text">
                          <strong>{command.label}</strong>
                          <small>{command.detail}</small>
                        </span>
                        <span className="palette-result-arrow" aria-hidden="true">
                          ↵
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="palette-empty">No available actions match “{query}”.</p>
            )}
          </div>

          <div className="palette-preview-pane" aria-hidden="true">
            {activeItem ? (
              <div className="palette-preview-content">
                <div className="palette-preview-wireframe">
                  <PreviewWireframe variant={activeItem.previewVariant} />
                </div>
                <div className="palette-preview-header">
                  <span className="palette-preview-category">{activeItem.category}</span>
                  <span className="palette-preview-status">
                    <span className="palette-status-dot" />
                    {activeItem.statusText || 'Ready'}
                  </span>
                </div>
                <h3 className="palette-preview-title">{activeItem.label}</h3>
                <p className="palette-preview-desc">{activeItem.detail}</p>
                <div className="palette-preview-hints">
                  <span>
                    <kbd>↵</kbd> Open
                  </span>
                  <span>
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> Navigate
                  </span>
                  <span>
                    <kbd>ESC</kbd> Close
                  </span>
                </div>
              </div>
            ) : (
              <div className="palette-preview-empty">Select an action to view preview</div>
            )}
          </div>
        </div>

        <div className="palette-footer">
          <span>Search actions, workspaces, and appearance</span>
          <div className="palette-footer-shortcuts">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> Navigate
            </span>
            <span>
              <kbd>↵</kbd> Select
            </span>
            <span>
              <kbd>ESC</kbd> Close
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

