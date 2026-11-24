/**
 * NEXORA Unified Timeline Data Layer
 * 
 * Provides a clean abstraction for the Overview "Today" feed, combining:
 * - Unread messages (Connect / Communications)
 * - Tasks (Workspaces / Productivity)
 * - GitHub activity (Build / Commits / PRs)
 * - Calendar events (Schedules / Syncs)
 * 
 * In Phase 1 & 2, this feeds from a typed mock provider labeled explicitly as
 * "Sample data" in the UI. In subsequent phases, real API adapters (Google Calendar,
 * GitHub REST/GraphQL, Connect WebSockets) implement this exact same interface.
 */

export type TimelineCategory = 'unread' | 'task' | 'github' | 'calendar';

export interface TimelineItem {
  id: string;
  category: TimelineCategory;
  title: string;
  snippet: string;
  timestamp: string; // ISO 8601 string
  timeDisplay: string; // Formatted 12-hour time e.g. "09:15 AM"
  source: string; // e.g. "Connect", "Google Calendar", "GitHub", "Tasks"
  sourceBadge: string; // e.g. "#design-systems", "Sprint 4", "PR #142", "Studio"
  actor?: {
    name: string;
    role?: string;
    avatar?: string;
  };
  actionLabel: string;
  actionHref: string;
  isCompleted?: boolean;
  isRead?: boolean;
  isSample: true; // Honest declaration flag: always true for mock items
  sampleNotice: string; // Explicit disclosure
}

export interface TimelineDataProvider {
  getItems(filter?: TimelineCategory | 'all'): Promise<TimelineItem[]>;
  toggleTask(id: string): Promise<TimelineItem | null>;
  markAsRead(id: string): Promise<TimelineItem | null>;
}

export const INITIAL_TIMELINE_ITEMS: TimelineItem[] = [
  {
    id: 'timeline-item-1',
    category: 'unread',
    title: 'Motion curves review for Peek Card hover preview',
    snippet: 'Drafted the 180ms ease-out spring transitions. Take a look when you have a quiet moment.',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    timeDisplay: '09:15 AM',
    source: 'Connect',
    sourceBadge: '#design-systems',
    actor: {
      name: 'Elena Rostova',
      role: 'Principal Designer',
      avatar: 'ER',
    },
    actionLabel: 'Open Connect',
    actionHref: '/connect',
    isRead: false,
    isSample: true,
    sampleNotice: 'Sample data · Demonstrates future Connect API feed',
  },
  {
    id: 'timeline-item-2',
    category: 'calendar',
    title: 'Nexora Studio & Creative Direction Sync',
    snippet: 'Review of Phase 2 roadmap, unified timeline visual weight, and typography hierarchy.',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    timeDisplay: '10:00 AM',
    source: 'Google Calendar',
    sourceBadge: 'Design Room A',
    actor: {
      name: 'Marcus Vance',
      role: 'Creative Director',
      avatar: 'MV',
    },
    actionLabel: 'View details',
    actionHref: '/workspace',
    isSample: true,
    sampleNotice: 'Sample data · Demonstrates future Google Calendar sync',
  },
  {
    id: 'timeline-item-3',
    category: 'github',
    title: 'PR #142: Design token contrast & self-hosted dyslexia font',
    snippet: 'Verified WCAG AA compliance in Light, Warm, and Dark modes. axe and Lighthouse checks passing.',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    timeDisplay: '11:30 AM',
    source: 'GitHub',
    sourceBadge: 'nexora/core · PR #142',
    actor: {
      name: 'Alex Chen',
      role: 'Front-End Lead',
      avatar: 'AC',
    },
    actionLabel: 'Open Build',
    actionHref: '/build',
    isSample: true,
    sampleNotice: 'Sample data · Demonstrates future GitHub App webhook feed',
  },
  {
    id: 'timeline-item-4',
    category: 'task',
    title: 'Audit focus rings on Firefox & Linux high-contrast mode',
    snippet: 'Ensure the 2px outline-offset stays crisp across varied DPI scaling and screen densities.',
    timestamp: new Date().toISOString(),
    timeDisplay: '01:15 PM',
    source: 'Tasks',
    sourceBadge: 'Sprint 2 · High Priority',
    actionLabel: 'View Task',
    actionHref: '/workspace',
    isCompleted: false,
    isSample: true,
    sampleNotice: 'Sample data · Demonstrates future Task manager integration',
  },
  {
    id: 'timeline-item-5',
    category: 'calendar',
    title: 'Quarterly API Strategy & Extension Framework',
    snippet: 'Discussion on sandboxed API adapters for GitHub, Google Workspace, and Telegram bots.',
    timestamp: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
    timeDisplay: '02:45 PM',
    source: 'Google Calendar',
    sourceBadge: 'Virtual Room',
    actor: {
      name: 'Sophia Patel',
      role: 'Systems Architect',
      avatar: 'SP',
    },
    actionLabel: 'View details',
    actionHref: '/workspace',
    isSample: true,
    sampleNotice: 'Sample data · Demonstrates future Calendar event sync',
  },
  {
    id: 'timeline-item-6',
    category: 'task',
    title: 'Refine ambient audio buffer loop in Web Audio API',
    snippet: 'Verify that brownian noise and rain audio generator stops promptly when focus timer ends.',
    timestamp: new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString(),
    timeDisplay: '04:30 PM',
    source: 'Tasks',
    sourceBadge: 'Focus Room Enhancement',
    actionLabel: 'Focus Room',
    actionHref: '/#focus',
    isCompleted: false,
    isSample: true,
    sampleNotice: 'Sample data · Demonstrates future Task manager integration',
  },
  {
    id: 'timeline-item-7',
    category: 'unread',
    title: 'Security policy & CSP frame-ancestors confirmed',
    snippet: 'Confirmed X-Frame-Options SAMEORIGIN and CSP allow Peek Card without third-party exposure.',
    timestamp: new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString(),
    timeDisplay: '05:10 PM',
    source: 'Connect',
    sourceBadge: 'Direct Message',
    actor: {
      name: 'Marcus Vance',
      role: 'Creative Director',
      avatar: 'MV',
    },
    actionLabel: 'Open Connect',
    actionHref: '/connect',
    isRead: false,
    isSample: true,
    sampleNotice: 'Sample data · Demonstrates future Connect direct messaging feed',
  },
];

const STORAGE_KEY = 'nexora_timeline_state';
export const DEMO_STORAGE_KEY = 'nexora_demo_data_enabled';
export const USER_ITEMS_STORAGE_KEY = 'nexora_timeline_user_items';

export function isDemoDataActive(): boolean {
  if (typeof window === 'undefined') return true;
  const item = window.localStorage.getItem(DEMO_STORAGE_KEY);
  return item !== 'false';
}

export function clearDemoData(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEMO_STORAGE_KEY, 'false');
    window.dispatchEvent(new CustomEvent('nexora-timeline-change'));
  }
}

export function restoreDemoData(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEMO_STORAGE_KEY, 'true');
    window.dispatchEvent(new CustomEvent('nexora-timeline-change'));
  }
}

class LocalMockTimelineProvider implements TimelineDataProvider {
  private inMemoryStore: Record<string, { isCompleted?: boolean; isRead?: boolean }> = {};

  private loadSavedState(): Record<string, { isCompleted?: boolean; isRead?: boolean }> {
    if (typeof window === 'undefined') return this.inMemoryStore;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : this.inMemoryStore;
    } catch {
      return this.inMemoryStore;
    }
  }

  private saveState(state: Record<string, { isCompleted?: boolean; isRead?: boolean }>) {
    this.inMemoryStore = state;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  async getItems(filter: TimelineCategory | 'all' = 'all'): Promise<TimelineItem[]> {
    if (!isDemoDataActive()) {
      // In clean mode, demo items are strictly hidden
      return [];
    }

    const saved = this.loadSavedState();
    const items = INITIAL_TIMELINE_ITEMS.map(item => {
      const override = saved[item.id];
      if (!override) return { ...item };
      return {
        ...item,
        isCompleted: override.isCompleted ?? item.isCompleted,
        isRead: override.isRead ?? item.isRead,
      };
    });

    if (filter === 'all') return items;
    return items.filter(item => item.category === filter);
  }

  async toggleTask(id: string): Promise<TimelineItem | null> {
    const saved = this.loadSavedState();
    const existing = INITIAL_TIMELINE_ITEMS.find(i => i.id === id);
    if (!existing || existing.category !== 'task') return null;

    const currentCompleted = saved[id]?.isCompleted ?? existing.isCompleted ?? false;
    const nextCompleted = !currentCompleted;

    saved[id] = { ...saved[id], isCompleted: nextCompleted };
    this.saveState(saved);

    return {
      ...existing,
      isCompleted: nextCompleted,
    };
  }

  async markAsRead(id: string): Promise<TimelineItem | null> {
    const saved = this.loadSavedState();
    const existing = INITIAL_TIMELINE_ITEMS.find(i => i.id === id);
    if (!existing || existing.category !== 'unread') return null;

    saved[id] = { ...saved[id], isRead: true };
    this.saveState(saved);

    return {
      ...existing,
      isRead: true,
    };
  }
}

export const defaultTimelineProvider: TimelineDataProvider = new LocalMockTimelineProvider();
