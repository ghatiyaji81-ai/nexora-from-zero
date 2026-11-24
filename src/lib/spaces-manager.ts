/**
 * NEXORA Spaces & Profiles Manager (Phase 2, Item 4)
 * Provides multi-profile workspace management (Work, Study, Personal, + Custom).
 * Each space manages its own theme, accent, pinned routes, bento layout,
 * and notification rules stored under per-space persistent keys.
 */

import { BentoCardLayoutItem, DEFAULT_BENTO_LAYOUT } from './bento-layout';

export type SpaceTheme = 'light' | 'warm' | 'dark';
export type SpaceAccent = 'lime' | 'iris' | 'cyan' | 'amber' | 'rose';

export interface SpaceNotificationRules {
  muteNotifications: boolean;
  quietHoursEnabled: boolean;
  digestFrequencyPerDay: number;
}

export interface SpaceProfile {
  id: string;
  name: string;
  icon: string;
  isSystemDefault?: boolean;
  theme: SpaceTheme;
  accent: SpaceAccent;
  pinnedRoutes: string[];
  bentoLayout: BentoCardLayoutItem[];
  notificationRules: SpaceNotificationRules;
  createdAt: number;
}

export const SPACES_LIST_KEY = 'nexora_spaces_list';
export const ACTIVE_SPACE_KEY = 'nexora_active_space_id';
export const SPACE_PREFIX_KEY = 'nexora_space_';
export const USER_THEME_OVERRIDE_KEY = 'nexora_theme_user_explicit_override';

export const INITIAL_SPACES: SpaceProfile[] = [
  {
    id: 'work',
    name: 'Work',
    icon: '💼',
    isSystemDefault: true,
    theme: 'dark',
    accent: 'cyan',
    pinnedRoutes: ['/build', '/think', '/connect'],
    bentoLayout: [...DEFAULT_BENTO_LAYOUT],
    notificationRules: {
      muteNotifications: false,
      quietHoursEnabled: true,
      digestFrequencyPerDay: 3,
    },
    createdAt: 1700000000000,
  },
  {
    id: 'study',
    name: 'Study',
    icon: '📚',
    isSystemDefault: true,
    theme: 'warm',
    accent: 'amber',
    pinnedRoutes: ['/discover', '/think', '/connect'],
    bentoLayout: [...DEFAULT_BENTO_LAYOUT],
    notificationRules: {
      muteNotifications: true,
      quietHoursEnabled: true,
      digestFrequencyPerDay: 2,
    },
    createdAt: 1700000001000,
  },
  {
    id: 'personal',
    name: 'Personal',
    icon: '🌿',
    isSystemDefault: true,
    theme: 'light',
    accent: 'rose',
    pinnedRoutes: ['/create', '/speak', '/social'],
    bentoLayout: [...DEFAULT_BENTO_LAYOUT],
    notificationRules: {
      muteNotifications: false,
      quietHoursEnabled: false,
      digestFrequencyPerDay: 1,
    },
    createdAt: 1700000002000,
  },
];

let inMemorySpaces: SpaceProfile[] = [...INITIAL_SPACES];
let inMemoryActiveId = 'work';
let inMemoryUserThemeOverride = false;

export function hasUserExplicitThemeOverride(): boolean {
  if (typeof window === 'undefined') return inMemoryUserThemeOverride;
  return window.localStorage.getItem(USER_THEME_OVERRIDE_KEY) === 'true';
}

export function setUserExplicitThemeOverride(isExplicit = true): void {
  inMemoryUserThemeOverride = isExplicit;
  if (typeof window === 'undefined') return;
  if (isExplicit) {
    window.localStorage.setItem(USER_THEME_OVERRIDE_KEY, 'true');
  } else {
    window.localStorage.removeItem(USER_THEME_OVERRIDE_KEY);
  }
}

export function getSpaces(): SpaceProfile[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(SPACES_LIST_KEY);
      if (raw) {
        const parsed: SpaceProfile[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
  }
  return [...inMemorySpaces];
}

function saveSpacesList(spaces: SpaceProfile[]): void {
  inMemorySpaces = [...spaces];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(SPACES_LIST_KEY, JSON.stringify(spaces));
      // Save per-space specific config
      for (const space of spaces) {
        window.localStorage.setItem(`${SPACE_PREFIX_KEY}${space.id}`, JSON.stringify(space));
      }
      window.dispatchEvent(new CustomEvent('nexora-spaces-change', { detail: spaces }));
    } catch {}
  }
}

export function getActiveSpace(): SpaceProfile {
  const spaces = getSpaces();
  let activeId = inMemoryActiveId;

  if (typeof window !== 'undefined' && window.localStorage) {
    activeId = window.localStorage.getItem(ACTIVE_SPACE_KEY) || activeId;
  }

  const found = spaces.find((s) => s.id === activeId);
  return found || spaces[0] || INITIAL_SPACES[0];
}

export function switchSpace(id: string): SpaceProfile {
  const spaces = getSpaces();
  const target = spaces.find((s) => s.id === id);
  if (!target) return getActiveSpace();

  inMemoryActiveId = target.id;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(ACTIVE_SPACE_KEY, target.id);

      // Only apply space theme if user did not explicitly override global theme
      if (!hasUserExplicitThemeOverride()) {
        window.localStorage.setItem('nexora-theme', target.theme);
        window.localStorage.setItem('nexora-accent', target.accent);
        document.documentElement.dataset.theme = target.theme;
        document.documentElement.dataset.accent = target.accent;
      }

      // Apply space pins
      window.localStorage.setItem('nexora-pinned-spaces', JSON.stringify(target.pinnedRoutes));
      window.dispatchEvent(new CustomEvent('nexora-pins-change'));

      window.dispatchEvent(
        new CustomEvent('nexora-space-change', {
          detail: target,
        })
      );
    } catch {}
  }

  return target;
}

export function createSpace(options: {
  name: string;
  theme?: SpaceTheme;
  accent?: SpaceAccent;
  pinnedRoutes?: string[];
  icon?: string;
}): SpaceProfile {
  const spaces = getSpaces();
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const newSpace: SpaceProfile = {
    id,
    name: options.name.trim() || 'New Space',
    icon: options.icon || '📁',
    theme: options.theme || 'light',
    accent: options.accent || 'lime',
    pinnedRoutes: options.pinnedRoutes || ['/connect', '/think', '/build'],
    bentoLayout: [...DEFAULT_BENTO_LAYOUT],
    notificationRules: {
      muteNotifications: false,
      quietHoursEnabled: false,
      digestFrequencyPerDay: 3,
    },
    createdAt: Date.now(),
  };

  const next = [...spaces, newSpace];
  saveSpacesList(next);
  return newSpace;
}

export function renameSpace(id: string, newName: string): SpaceProfile | null {
  const spaces = getSpaces();
  const index = spaces.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const updated: SpaceProfile = {
    ...spaces[index],
    name: newName.trim() || spaces[index].name,
  };

  const next = [...spaces];
  next[index] = updated;
  saveSpacesList(next);

  if (inMemoryActiveId === id) {
    switchSpace(id);
  }

  return updated;
}

export function deleteSpace(id: string): { success: boolean; deletedSpace?: SpaceProfile } {
  const spaces = getSpaces();
  if (spaces.length <= 1) {
    // Cannot delete the only remaining space
    return { success: false };
  }

  const target = spaces.find((s) => s.id === id);
  if (!target) return { success: false };

  const next = spaces.filter((s) => s.id !== id);
  saveSpacesList(next);

  // If deleted active space, switch to the first available space
  if (getActiveSpace().id === id) {
    switchSpace(next[0].id);
  }

  return { success: true, deletedSpace: target };
}

export function restoreSpace(space: SpaceProfile): void {
  const spaces = getSpaces();
  if (spaces.some((s) => s.id === space.id)) return;
  const next = [...spaces, space];
  saveSpacesList(next);
}

