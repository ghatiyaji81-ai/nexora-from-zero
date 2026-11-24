/**
 * NEXORA Wellbeing & Daily Reflection Engine (Phase 2, Item 7)
 * Handles:
 * - Energy check-in (at most twice daily, 3 levels, skippable, suggestions)
 * - Weekly focus report and daily wrap-up (gentle tone, zero guilt wording)
 * - Complete local privacy with "Export my data" and "Delete my data"
 */

import { getFocusState, getGentleStreakData } from './focus-manager';
import { defaultTimelineProvider } from './timeline-data';

export type EnergyLevel = 'low' | 'steady' | 'high';

export interface EnergyCheckinEntry {
  timestamp: number;
  dateStr: string;
  period: 'morning' | 'afternoon';
  level: EnergyLevel;
  headline: string;
  suggestion: string;
  targetRoute: string;
}

export interface DailyWrapup {
  dateStr: string;
  focusMinutes: number;
  completedTasks: number;
  gentleSummary: string;
}

export interface WeeklyFocusReport {
  weekLabel: string;
  totalFocusMinutes: number;
  totalSessions: number;
  gentleSummary: string;
}

const ENERGY_STORAGE_KEY = 'nexora_wellbeing_energy_checkins';
const MAX_CHECKINS_PER_DAY = 2;

let inMemoryEnergyEntries: EnergyCheckinEntry[] = [];

export function getTodayPeriod(): 'morning' | 'afternoon' {
  const hour = new Date().getHours();
  return hour < 13 ? 'morning' : 'afternoon';
}

export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function getEnergyHistory(): EnergyCheckinEntry[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(ENERGY_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return inMemoryEnergyEntries;
}

function saveEnergyHistory(entries: EnergyCheckinEntry[]): void {
  inMemoryEnergyEntries = entries;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(ENERGY_STORAGE_KEY, JSON.stringify(entries));
      window.dispatchEvent(new CustomEvent('nexora-wellbeing-change', { detail: entries }));
    } catch {}
  }
}

export function canCheckinToday(): { allowed: boolean; period: 'morning' | 'afternoon'; lastEntry?: EnergyCheckinEntry } {
  const history = getEnergyHistory();
  const todayStr = getTodayDateString();
  const currentPeriod = getTodayPeriod();

  const todayEntries = history.filter((e) => e.dateStr === todayStr);

  if (todayEntries.length >= MAX_CHECKINS_PER_DAY) {
    return { allowed: false, period: currentPeriod, lastEntry: todayEntries[todayEntries.length - 1] };
  }

  const existingInPeriod = todayEntries.find((e) => e.period === currentPeriod);
  if (existingInPeriod) {
    return { allowed: false, period: currentPeriod, lastEntry: existingInPeriod };
  }

  return { allowed: true, period: currentPeriod };
}

export function getEnergySuggestion(level: EnergyLevel): {
  headline: string;
  suggestion: string;
  targetRoute: string;
} {
  switch (level) {
    case 'low':
      return {
        headline: 'Gentle Pace',
        suggestion: 'Keep it light today. Catch up on quiet reading in Discover, organize reference notes, or take an intentional break.',
        targetRoute: '/discover',
      };
    case 'steady':
      return {
        headline: 'Balanced Flow',
        suggestion: 'Good steady focus. Work through your Connect communications, draft documents in Create, or review code proposals.',
        targetRoute: '/connect',
      };
    case 'high':
      return {
        headline: 'Deep Problem Solving',
        suggestion: 'High clarity window. Ready for a 25-minute sprint in the Focus Room or complex system implementation in Build.',
        targetRoute: '/build',
      };
  }
}

export function recordEnergyCheckin(level: EnergyLevel): EnergyCheckinEntry {
  const period = getTodayPeriod();
  const dateStr = getTodayDateString();
  const { headline, suggestion, targetRoute } = getEnergySuggestion(level);

  const entry: EnergyCheckinEntry = {
    timestamp: Date.now(),
    dateStr,
    period,
    level,
    headline,
    suggestion,
    targetRoute,
  };

  const history = getEnergyHistory();
  saveEnergyHistory([entry, ...history]);
  return entry;
}

export async function getDailyWrapup(): Promise<DailyWrapup> {
  const streak = getGentleStreakData();

  let gentleSummary = 'A quiet day of intentional presence. Whatever you accomplished today is enough.';
  if (streak.todayCount > 0) {
    gentleSummary = `You completed ${streak.todayCount} focus sessions (${streak.todayCount * 25} minutes) of undistracted presence today. Great job protecting your calm.`;
  }

  return {
    dateStr: getTodayDateString(),
    focusMinutes: streak.todayCount * 25,
    completedTasks: streak.todayCount, // 100% real focus sessions completed today (excludes mock timeline tasks)
    gentleSummary,
  };
}

export function getWeeklyFocusReport(): WeeklyFocusReport {
  const streak = getGentleStreakData();
  const totalMinutes = streak.weekCount * 25;

  let gentleSummary = 'Every quiet minute gives your mind room to think. Showing up with patience.';
  if (streak.weekCount >= 4) {
    gentleSummary = `Strong, sustainable consistency this week across ${streak.weekCount} sessions without burnout.`;
  } else if (streak.weekCount > 0) {
    gentleSummary = `You protected ${totalMinutes} minutes of distraction-free space this week. Steady and gentle progress.`;
  }

  return {
    weekLabel: 'This Week',
    totalFocusMinutes: totalMinutes,
    totalSessions: streak.weekCount,
    gentleSummary,
  };
}

/**
 * Data Privacy & Export
 */
export function exportAllLocalData(): string {
  const payload: Record<string, unknown> = {
    exportDate: new Date().toISOString(),
    nexoraVersion: '0.1.0',
    dataStorage: 'Browser local storage only',
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.startsWith('nexora') || key.startsWith('nexora_') || key.startsWith('nexora-'))) {
        try {
          payload[key] = JSON.parse(window.localStorage.getItem(key) || '');
        } catch {
          payload[key] = window.localStorage.getItem(key);
        }
      }
    }
  }

  return JSON.stringify(payload, null, 2);
}

export function deleteAllLocalData(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    const keysToDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.startsWith('nexora') || key.startsWith('nexora_') || key.startsWith('nexora-'))) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      window.localStorage.removeItem(key);
    }
    window.dispatchEvent(new CustomEvent('nexora-data-cleared'));
  }
}
