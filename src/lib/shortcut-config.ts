/**
 * NEXORA Keyboard Shortcut Configuration & Remapping System
 * Provides user-configurable, persistent hotkeys to avoid Windows/browser collisions
 * (such as Alt+Shift clashing with Windows input language switching).
 */

export interface KeyCombo {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  display: string;
}

export interface ShortcutConfig {
  focusToggle: KeyCombo;
  dyslexicToggle: KeyCombo;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  focusToggle: {
    key: 'F',
    altKey: true,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    display: 'Alt+Shift+F',
  },
  dyslexicToggle: {
    key: 'D',
    altKey: true,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    display: 'Alt+Shift+D',
  },
};

export const POPULAR_ALTERNATIVES: Record<'focusToggle' | 'dyslexicToggle', KeyCombo[]> = {
  focusToggle: [
    { key: 'F', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, display: 'Alt+Shift+F' },
    { key: 'F', altKey: false, shiftKey: true, ctrlKey: true, metaKey: false, display: 'Ctrl+Shift+F' },
    { key: 'F8', altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, display: 'F8' },
    { key: 'P', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, display: 'Alt+Shift+P' },
  ],
  dyslexicToggle: [
    { key: 'D', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, display: 'Alt+Shift+D' },
    { key: 'D', altKey: false, shiftKey: true, ctrlKey: true, metaKey: false, display: 'Ctrl+Shift+D' },
    { key: 'F9', altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, display: 'F9' },
    { key: 'Y', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, display: 'Alt+Shift+Y' },
  ],
};

const STORAGE_KEY = 'nexora-custom-shortcuts-v1';

export function getShortcutsConfig(): ShortcutConfig {
  if (typeof window === 'undefined') return DEFAULT_SHORTCUTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SHORTCUTS;
    const parsed = JSON.parse(raw);
    return {
      focusToggle: parsed.focusToggle || DEFAULT_SHORTCUTS.focusToggle,
      dyslexicToggle: parsed.dyslexicToggle || DEFAULT_SHORTCUTS.dyslexicToggle,
    };
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

export function saveShortcut(action: keyof ShortcutConfig, combo: KeyCombo): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getShortcutsConfig();
    current[action] = combo;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('nexora-shortcuts-changed', { detail: current }));
  } catch {}
}

export function resetShortcuts(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('nexora-shortcuts-changed', { detail: DEFAULT_SHORTCUTS }));
  } catch {}
}

export function matchesCombo(e: KeyboardEvent, combo: KeyCombo): boolean {
  if (e.key.toLowerCase() !== combo.key.toLowerCase()) return false;
  if (Boolean(e.altKey) !== Boolean(combo.altKey)) return false;
  if (Boolean(e.shiftKey) !== Boolean(combo.shiftKey)) return false;
  if (Boolean(e.ctrlKey) !== Boolean(combo.ctrlKey)) return false;
  if (Boolean(e.metaKey) !== Boolean(combo.metaKey)) return false;
  return true;
}
