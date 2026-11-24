/**
 * NEXORA Bento-Grid Dashboard Layout Model
 * Handles user customization, ordering, column spanning, visibility,
 * and persistence to localStorage with honest workspace status bindings.
 */

import { getWorkspaceStatus, WorkspaceTier } from './workspace-status';

export type BentoCardId =
  | 'today-strip'
  | 'focus-timer'
  | 'principle'
  | 'quick-actions'
  | 'system-health'
  | 'communication-relief'
  | 'wellbeing'
  | 'rules-engine';

export interface BentoCardMeta {
  id: BentoCardId;
  title: string;
  category: string;
  description: string;
  status: {
    tier: WorkspaceTier;
    label: string;
  };
  minColSpan: 1 | 2;
  maxColSpan: 1 | 2;
  isResizable: boolean;
}

export interface BentoCardLayoutItem {
  id: BentoCardId;
  colSpan: 1 | 2;
  visible: boolean;
}

export const BENTO_STORAGE_KEY = 'nexora-bento-layout-v1';

export const BENTO_CARDS_META: Record<BentoCardId, BentoCardMeta> = {
  'today-strip': {
    id: 'today-strip',
    title: 'Today & Unified Feed',
    category: 'Activity Feed',
    description: 'Time-ordered timeline of notifications, tasks, calendar events, and code activity.',
    status: {
      tier: 'Preview',
      label: 'Preview · Sample data',
    },
    minColSpan: 1,
    maxColSpan: 2,
    isResizable: true,
  },
  'focus-timer': {
    id: 'focus-timer',
    title: 'Focus Room & Shield',
    category: 'Attention',
    description: 'Local 25-minute attention timer with distraction shield and gentle streaks.',
    status: {
      tier: getWorkspaceStatus('FOCUS').tier,
      label: getWorkspaceStatus('FOCUS').statusText,
    },
    minColSpan: 1,
    maxColSpan: 2,
    isResizable: true,
  },
  'principle': {
    id: 'principle',
    title: 'The Nexora Principle',
    category: 'Philosophy',
    description: 'Core design ethos: one calm place for useful work without algorithmic noise.',
    status: {
      tier: 'Live',
      label: 'Live · Manifesto',
    },
    minColSpan: 1,
    maxColSpan: 2,
    isResizable: true,
  },
  'quick-actions': {
    id: 'quick-actions',
    title: 'Space Jump & Shortcuts',
    category: 'Navigation',
    description: 'Quick-access launchers and keyboard shortcuts for immediate space navigation.',
    status: {
      tier: 'Live',
      label: 'Live · Browser nav',
    },
    minColSpan: 1,
    maxColSpan: 2,
    isResizable: true,
  },
  'system-health': {
    id: 'system-health',
    title: 'Workspace Architecture',
    category: 'Status',
    description: 'Live overview of ecosystem space readiness, local storage, and connection health.',
    status: {
      tier: 'Live',
      label: 'Live · Local state',
    },
    minColSpan: 1,
    maxColSpan: 2,
    isResizable: true,
  },
  'communication-relief': {
    id: 'communication-relief',
    title: 'Communication Relief',
    category: 'Communication',
    description: 'Quiet notification batches, daily digest, VIP bypass, and unified compose box.',
    status: {
      tier: 'Preview',
      label: 'Preview · Sample data',
    },
    minColSpan: 1,
    maxColSpan: 2,
    isResizable: true,
  },
  'wellbeing': {
    id: 'wellbeing',
    title: 'Energy & Reflection',
    category: 'Wellbeing',
    description: 'Energy check-ins, weekly focus reflection, and local data export/deletion controls.',
    status: {
      tier: 'Live',
      label: 'Live · Browser local',
    },
    minColSpan: 1,
    maxColSpan: 2,
    isResizable: true,
  },
  'rules-engine': {
    id: 'rules-engine',
    title: 'Rules & Automation',
    category: 'Automation',
    description: 'In-app automation rules, one-click calm routines, and dry-run execution testing.',
    status: {
      tier: 'Live',
      label: 'Live · In-app engine',
    },
    minColSpan: 1,
    maxColSpan: 2,
    isResizable: true,
  },
};

export const DEFAULT_BENTO_LAYOUT: BentoCardLayoutItem[] = [
  { id: 'today-strip', colSpan: 2, visible: true },
  { id: 'focus-timer', colSpan: 1, visible: true },
  { id: 'principle', colSpan: 1, visible: true },
  { id: 'communication-relief', colSpan: 2, visible: true },
  { id: 'wellbeing', colSpan: 2, visible: true },
  { id: 'rules-engine', colSpan: 2, visible: true },
  { id: 'quick-actions', colSpan: 1, visible: true },
  { id: 'system-health', colSpan: 1, visible: true },
];

let inMemoryLayoutStore: BentoCardLayoutItem[] | null = null;

/**
 * Validate and sanitize layout array to ensure all required cards exist
 * without duplicates or invalid IDs.
 */
export function sanitizeBentoLayout(raw: unknown): BentoCardLayoutItem[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_BENTO_LAYOUT];
  }

  const validIds = new Set<BentoCardId>(Object.keys(BENTO_CARDS_META) as BentoCardId[]);
  const seenIds = new Set<BentoCardId>();
  const sanitized: BentoCardLayoutItem[] = [];

  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as BentoCardLayoutItem).id === 'string' &&
      validIds.has((item as BentoCardLayoutItem).id) &&
      !seenIds.has((item as BentoCardLayoutItem).id)
    ) {
      const cardId = (item as BentoCardLayoutItem).id;
      seenIds.add(cardId);
      sanitized.push({
        id: cardId,
        colSpan: (item as BentoCardLayoutItem).colSpan === 2 ? 2 : 1,
        visible: (item as BentoCardLayoutItem).visible !== false,
      });
    }
  }

  // Append any missing cards from default layout
  for (const def of DEFAULT_BENTO_LAYOUT) {
    if (!seenIds.has(def.id)) {
      sanitized.push({ ...def });
      seenIds.add(def.id);
    }
  }

  return sanitized;
}

export function loadBentoLayout(): BentoCardLayoutItem[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(BENTO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return sanitizeBentoLayout(parsed);
      }
    } catch {
      // Ignore JSON error and fallback
    }
  }

  if (inMemoryLayoutStore) {
    return [...inMemoryLayoutStore];
  }

  return [...DEFAULT_BENTO_LAYOUT];
}

export function saveBentoLayout(layout: BentoCardLayoutItem[]): BentoCardLayoutItem[] {
  const sanitized = sanitizeBentoLayout(layout);
  inMemoryLayoutStore = [...sanitized];

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(BENTO_STORAGE_KEY, JSON.stringify(sanitized));
      window.dispatchEvent(
        new CustomEvent('nexora-bento-layout-change', {
          detail: sanitized,
        })
      );
    } catch {
      // Storage unavailable or quota exceeded
    }
  }

  return sanitized;
}

export function resetBentoLayout(): BentoCardLayoutItem[] {
  return saveBentoLayout(DEFAULT_BENTO_LAYOUT);
}

export function toggleCardVisibility(id: BentoCardId): BentoCardLayoutItem[] {
  const current = loadBentoLayout();
  const next = current.map((item) =>
    item.id === id ? { ...item, visible: !item.visible } : item
  );
  // Ensure at least one card remains visible
  const anyVisible = next.some((item) => item.visible);
  if (!anyVisible) {
    return current;
  }
  return saveBentoLayout(next);
}

export function toggleCardColSpan(id: BentoCardId): BentoCardLayoutItem[] {
  const current = loadBentoLayout();
  const next = current.map((item) => {
    if (item.id === id) {
      const newSpan: 1 | 2 = item.colSpan === 1 ? 2 : 1;
      return { ...item, colSpan: newSpan };
    }
    return item;
  });
  return saveBentoLayout(next);
}

export function reorderCards(activeId: BentoCardId, overId: BentoCardId): BentoCardLayoutItem[] {
  const current = loadBentoLayout();
  const oldIndex = current.findIndex((item) => item.id === activeId);
  const newIndex = current.findIndex((item) => item.id === overId);

  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return current;
  }

  const next = [...current];
  const [removed] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, removed);

  return saveBentoLayout(next);
}

