/**
 * NEXORA Focus Session & Distraction Shield Manager
 * Provides global state management, timer tick, space whitelisting,
 * notification muting, gentle streaks tracking, and ambient sound teardown.
 */

import { stopAmbientSound } from './ambient-sound';

export interface FocusSessionState {
  isActive: boolean;
  isPaused: boolean;
  remainingSeconds: number;
  totalDurationSeconds: number;
  chosenSpace: string;
  chosenSpaceLabel: string;
  allowedSpaces: string[];
  temporaryPasses: string[];
  distractionShieldEnabled: boolean;
  notificationsMuted: boolean;
  startedAt: number | null;
  isBreakMode?: boolean;
  focusedSecondsInSession?: number;
}

export interface GentleStreakData {
  todayCount: number;
  weekCount: number;
  totalMinutes: number;
  totalSeconds: number;
  weekTotalSeconds: number;
  weekTotalMinutes: number;
  message: string;
}

export interface FocusRecord {
  timestamp: number;
  date: string;
  minutes: number;
  seconds: number;
}

const STORAGE_KEY = 'nexora-focus-session-state';
const STREAKS_KEY = 'nexora-gentle-streaks';
const DEFAULT_DURATION = 25 * 60; // 25 minutes
const MAX_STALE_PAUSE_MS = 4 * 60 * 60 * 1000; // 4 hours

const DEFAULT_STATE: FocusSessionState = {
  isActive: false,
  isPaused: false,
  remainingSeconds: DEFAULT_DURATION,
  totalDurationSeconds: DEFAULT_DURATION,
  chosenSpace: '/',
  chosenSpaceLabel: 'Overview',
  allowedSpaces: ['/', '/#focus'],
  temporaryPasses: [],
  distractionShieldEnabled: true,
  notificationsMuted: false,
  startedAt: null,
  isBreakMode: false,
  focusedSecondsInSession: 0,
};

let memoryState: FocusSessionState = { ...DEFAULT_STATE };
let timerInterval: ReturnType<typeof setInterval> | null = null;
let isInitialized = false;

export function formatFocusTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function getSpaceLabel(path: string): string {
  if (path.startsWith('/connect')) return 'Connect';
  if (path.startsWith('/think')) return 'Think';
  if (path.startsWith('/speak')) return 'Speak';
  if (path.startsWith('/create')) return 'Create';
  if (path.startsWith('/build')) return 'Build';
  if (path.startsWith('/discover')) return 'Discover';
  if (path.startsWith('/social')) return 'Social';
  if (path.includes('focus')) return 'Focus Room';
  return 'Overview';
}

function notifyStateChange() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryState));
  } catch {}
  window.dispatchEvent(
    new CustomEvent('nexora-focus-change', {
      detail: { ...memoryState },
    })
  );
}

let inMemoryRecords: FocusRecord[] = [];

export function recordCompletedSession(minutes: number, seconds?: number) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const actualSeconds = typeof seconds === 'number' && seconds > 0 ? seconds : minutes * 60;
  const newRecord: FocusRecord = {
    timestamp: now,
    date: todayStr,
    minutes: Math.round(actualSeconds / 60),
    seconds: actualSeconds,
  };

  inMemoryRecords.push(newRecord);
  inMemoryRecords = inMemoryRecords.filter(r => r.timestamp >= now - 30 * 24 * 60 * 60 * 1000);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STREAKS_KEY);
      let records: FocusRecord[] = [];
      if (raw) {
        records = JSON.parse(raw);
        if (!Array.isArray(records)) records = [];
      }
      records.push(newRecord);
      records = records.filter(r => r.timestamp >= now - 30 * 24 * 60 * 60 * 1000);
      window.localStorage.setItem(STREAKS_KEY, JSON.stringify(records));
    } catch {}
  }
}

export function getGentleStreakData(): GentleStreakData {
  let records: FocusRecord[] = [...inMemoryRecords];

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STREAKS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as FocusRecord[];
        if (Array.isArray(parsed)) {
          records = parsed;
        }
      }
    } catch {}
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const todayRecords = records.filter(r => r.date === todayStr);
  const weekRecords = records.filter(r => r.timestamp >= oneWeekAgo);

  const todayCount = todayRecords.length;
  const weekCount = weekRecords.length;
  const totalSeconds = todayRecords.reduce((acc, r) => acc + (typeof r.seconds === 'number' ? r.seconds : (r.minutes || 25) * 60), 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  const weekTotalSeconds = weekRecords.reduce((acc, r) => acc + (typeof r.seconds === 'number' ? r.seconds : (r.minutes || 25) * 60), 0);
  const weekTotalMinutes = Math.round(weekTotalSeconds / 60);

  let message = 'Ready when you are. Showing up with quiet intention.';
  if (todayCount === 1) {
    message = `1 focused session completed today (${totalMinutes}m of actual focus). A calm start.`;
  } else if (todayCount > 1) {
    message = `${todayCount} quiet sessions today (${totalMinutes}m of actual focus). Consistent and calm.`;
  } else if (weekCount > 0) {
    message = `${weekCount} sessions this week (${weekTotalMinutes}m focused). Gentle progress, never rushed.`;
  }

  return {
    todayCount,
    weekCount,
    totalMinutes,
    totalSeconds,
    weekTotalSeconds,
    weekTotalMinutes,
    message,
  };
}

function startTimerTick() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (!memoryState.isActive || memoryState.isPaused) return;

    if (memoryState.remainingSeconds <= 1) {
      // Completed session or break
      if (!memoryState.isBreakMode) {
        const actualSeconds = (memoryState.focusedSecondsInSession || 0) + 1;
        recordCompletedSession(Math.round(actualSeconds / 60), actualSeconds);
      }

      // If it was a break mode, restore normal shield mode cleanly
      const wasBreak = memoryState.isBreakMode;

      memoryState = {
        ...memoryState,
        remainingSeconds: wasBreak ? DEFAULT_DURATION : 0,
        isActive: false,
        isPaused: false,
        isBreakMode: false,
        distractionShieldEnabled: true, // returns to normal shield mode after break ends
        notificationsMuted: false,
        focusedSecondsInSession: 0,
      };

      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;

      // Stop ambient sound cleanly on session finish
      stopAmbientSound();

      notifyStateChange();
      return;
    }

    // Increment focused seconds when in active focus mode (not break mode)
    const nextFocusedSeconds = !memoryState.isBreakMode
      ? (memoryState.focusedSecondsInSession || 0) + 1
      : (memoryState.focusedSecondsInSession || 0);

    memoryState = {
      ...memoryState,
      remainingSeconds: memoryState.remainingSeconds - 1,
      focusedSecondsInSession: nextFocusedSeconds,
    };
    notifyStateChange();
  }, 1000);
}

export function initFocusManager(): FocusSessionState {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  if (isInitialized) return { ...memoryState };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FocusSessionState>;
      memoryState = {
        ...DEFAULT_STATE,
        ...parsed,
      };

      // Stale session recovery check:
      // Prevent user from being trapped if session expired or was abandoned mid-way
      if (memoryState.isActive) {
        const now = Date.now();
        const startedAt = memoryState.startedAt || 0;

        // If session started more than 12 hours ago, expire it
        if (!startedAt || now - startedAt > 12 * 60 * 60 * 1000) {
          memoryState = { ...DEFAULT_STATE, distractionShieldEnabled: true };
        } else if (memoryState.isBreakMode) {
          // Break mode recovery check:
          const elapsed = Math.floor((now - startedAt) / 1000);
          const remaining = Math.max(0, memoryState.totalDurationSeconds - elapsed);
          if (remaining <= 0 || now - startedAt > 60 * 60 * 1000) {
            // Stale break expired: restore normal shield state
            memoryState = {
              ...DEFAULT_STATE,
              isActive: false,
              isBreakMode: false,
              distractionShieldEnabled: true,
            };
          } else {
            memoryState.remainingSeconds = remaining;
            startTimerTick();
          }
        } else if (memoryState.isPaused) {
          // If paused for more than 4 hours, expire cleanly
          if (now - startedAt > MAX_STALE_PAUSE_MS) {
            memoryState = { ...DEFAULT_STATE };
          }
        } else {
          // Active ticking session: calculate elapsed time
          const elapsed = Math.floor((now - startedAt) / 1000);
          const remaining = Math.max(0, memoryState.totalDurationSeconds - elapsed);
          if (remaining <= 0) {
            memoryState = {
              ...DEFAULT_STATE,
              remainingSeconds: 0,
              isActive: false,
            };
          } else {
            memoryState.remainingSeconds = remaining;
            startTimerTick();
          }
        }
      }

      // Re-save sanitized state back to storage
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryState));
    }
  } catch {
    memoryState = { ...DEFAULT_STATE };
  }

  isInitialized = true;
  return { ...memoryState };
}

export function getFocusState(): FocusSessionState {
  if (!isInitialized) return initFocusManager();
  return { ...memoryState };
}

export function startFocusSession(
  chosenSpace = '/',
  durationSeconds = DEFAULT_DURATION,
  enableShield = true
): FocusSessionState {
  const label = getSpaceLabel(chosenSpace);
  const allowed = ['/', '/#focus'];
  if (chosenSpace && !allowed.includes(chosenSpace)) {
    allowed.push(chosenSpace);
  }

  memoryState = {
    isActive: true,
    isPaused: false,
    remainingSeconds: durationSeconds,
    totalDurationSeconds: durationSeconds,
    chosenSpace,
    chosenSpaceLabel: label,
    allowedSpaces: allowed,
    temporaryPasses: [],
    distractionShieldEnabled: enableShield,
    notificationsMuted: true,
    startedAt: Date.now(),
    isBreakMode: false,
    focusedSecondsInSession: 0,
  };

  isInitialized = true;
  startTimerTick();
  notifyStateChange();
  return { ...memoryState };
}

export function startBreakSession(durationMinutes = 5): FocusSessionState {
  const durationSeconds = durationMinutes * 60;
  memoryState = {
    ...DEFAULT_STATE,
    isActive: true,
    isPaused: false,
    remainingSeconds: durationSeconds,
    totalDurationSeconds: durationSeconds,
    chosenSpace: '/#focus',
    chosenSpaceLabel: 'Break Room',
    distractionShieldEnabled: false,
    notificationsMuted: false,
    startedAt: Date.now(),
    isBreakMode: true,
  };

  isInitialized = true;

  startTimerTick();
  notifyStateChange();
  return { ...memoryState };
}

export function pauseFocusSession(): FocusSessionState {
  if (!memoryState.isActive) return memoryState;
  memoryState = {
    ...memoryState,
    isPaused: true,
  };
  notifyStateChange();
  return { ...memoryState };
}

export function resumeFocusSession(): FocusSessionState {
  if (!memoryState.isActive) return memoryState;
  memoryState = {
    ...memoryState,
    isPaused: false,
    startedAt: Date.now() - (memoryState.totalDurationSeconds - memoryState.remainingSeconds) * 1000,
  };
  startTimerTick();
  notifyStateChange();
  return { ...memoryState };
}

export function stopFocusSession(): FocusSessionState {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // Record actual focused time even on early stop
  if (!memoryState.isBreakMode && memoryState.focusedSecondsInSession && memoryState.focusedSecondsInSession > 0) {
    recordCompletedSession(
      Math.round(memoryState.focusedSecondsInSession / 60),
      memoryState.focusedSecondsInSession
    );
  }

  // Gracefully stop any active ambient sounds
  stopAmbientSound();

  memoryState = {
    ...DEFAULT_STATE,
    remainingSeconds: DEFAULT_DURATION,
    totalDurationSeconds: DEFAULT_DURATION,
    isActive: false,
    isPaused: false,
    notificationsMuted: false,
    focusedSecondsInSession: 0,
  };

  notifyStateChange();
  return { ...memoryState };
}

export function toggleDistractionShield(): boolean {
  memoryState = {
    ...memoryState,
    distractionShieldEnabled: !memoryState.distractionShieldEnabled,
  };
  notifyStateChange();
  return memoryState.distractionShieldEnabled;
}

export function grantTemporaryPass(spacePath: string): FocusSessionState {
  if (!memoryState.temporaryPasses.includes(spacePath)) {
    memoryState = {
      ...memoryState,
      temporaryPasses: [...memoryState.temporaryPasses, spacePath],
    };
    notifyStateChange();
  }
  return { ...memoryState };
}

export function isSpaceAllowed(targetPath: string, state: FocusSessionState = memoryState): boolean {
  if (!state.isActive || !state.distractionShieldEnabled) {
    return true;
  }

  // System and public paths are always allowed
  if (
    targetPath === '/' ||
    targetPath === '' ||
    targetPath === '/#focus' ||
    targetPath.startsWith('/login') ||
    targetPath.startsWith('/signup') ||
    targetPath.startsWith('/forgot-password') ||
    targetPath.startsWith('/reset-password') ||
    targetPath.startsWith('/api')
  ) {
    return true;
  }

  // Exact or prefix match against allowedSpaces
  for (const allowed of state.allowedSpaces) {
    if (allowed === targetPath) return true;
    if (allowed !== '/' && targetPath.startsWith(allowed)) return true;
  }

  // Temporary passes granted during this session
  for (const pass of state.temporaryPasses) {
    if (pass === targetPath || (pass !== '/' && targetPath.startsWith(pass))) {
      return true;
    }
  }

  return false;
}

export function isNotificationMuted(): boolean {
  return memoryState.isActive && memoryState.notificationsMuted;
}

export function isPathShielded(targetPath: string, state: FocusSessionState = memoryState): boolean {
  return !isSpaceAllowed(targetPath, state);
}
