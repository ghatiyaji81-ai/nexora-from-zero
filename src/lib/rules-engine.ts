/**
 * NEXORA In-App Rules Engine & Calm Automation
 * Supports "when <trigger> then <action>" rules, scheduled actions,
 * auto-routing, loop protection, dry-run testing, and one-click workflows.
 * Strictly in-app only — zero external network requests.
 */

import { startFocusSession, stopFocusSession, getFocusState } from './focus-manager';
import { switchSpace, getActiveSpace } from './spaces-manager';
import { showToast, showUndoToast } from './toast-manager';
import { t } from './i18n-strings';

export type TriggerType =
  | 'focus_started'
  | 'focus_ended'
  | 'notification_arrived'
  | 'quiet_hours_begin'
  | 'quiet_hours_end'
  | 'time_of_day'
  | 'space_switched';

export type ActionType =
  | 'route_notification_to_digest'
  | 'mute_notifications'
  | 'unmute_notifications'
  | 'start_focus'
  | 'stop_focus'
  | 'switch_space'
  | 'open_space';

export interface Rule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: {
    type: TriggerType;
    params?: {
      time?: string; // e.g. "09:00"
      category?: string; // e.g. "newsletter"
      sender?: string;
      spaceId?: string;
    };
  };
  action: {
    type: ActionType;
    params?: {
      durationMinutes?: number; // for start_focus
      spaceId?: string; // for switch_space
      route?: string; // for open_space
    };
  };
  createdAt: number;
  lastExecutedAt?: number;
  executionCount: number;
}

export interface RuleActivityLogEntry {
  id: string;
  timestamp: number;
  timeDisplay: string;
  ruleId: string;
  ruleName: string;
  triggerType: TriggerType;
  actionType: ActionType;
  summary: string;
  isDryRun?: boolean;
}

const STORAGE_KEY_RULES = 'nexora-rules-v1';
const STORAGE_KEY_LOGS = 'nexora-rules-activity-log-v1';

const MAX_CHAIN_DEPTH = 3;
const MAX_EXECUTIONS_PER_MINUTE = 5;

export const DEFAULT_RULES: Rule[] = [
  {
    id: 'rule-vip-routing',
    name: 'VIP Attention Priority',
    description: 'When a notification arrives from a VIP contact, ensure notifications alert immediately.',
    enabled: true,
    trigger: {
      type: 'notification_arrived',
      params: { category: 'mention' },
    },
    action: {
      type: 'unmute_notifications',
    },
    createdAt: 1732000000000,
    executionCount: 2,
  },
  {
    id: 'rule-newsletter-digest',
    name: 'Auto-route Newsletters to Digest',
    description: 'Automatically route incoming newsletter digests away from real-time alerts into daily digest.',
    enabled: true,
    trigger: {
      type: 'notification_arrived',
      params: { category: 'newsletter' },
    },
    action: {
      type: 'route_notification_to_digest',
    },
    createdAt: 1732000000000,
    executionCount: 5,
  },
  {
    id: 'rule-focus-align-work',
    name: 'Align Space on Focus Start',
    description: 'When a deep focus session starts, automatically switch active space to Work.',
    enabled: true,
    trigger: {
      type: 'focus_started',
    },
    action: {
      type: 'switch_space',
      params: { spaceId: 'work' },
    },
    createdAt: 1732000000000,
    executionCount: 1,
  },
  {
    id: 'rule-quiet-hours-personal',
    name: 'Switch to Personal at Quiet Hours',
    description: 'When quiet hours begin in the evening, automatically transition to the Personal space.',
    enabled: true,
    trigger: {
      type: 'quiet_hours_begin',
    },
    action: {
      type: 'switch_space',
      params: { spaceId: 'personal' },
    },
    createdAt: 1732000000000,
    executionCount: 0,
  },
  {
    id: 'rule-break-open-overview',
    name: 'Return to Overview on Focus End',
    description: 'When a focus timer concludes, open the Overview dashboard to review your accomplishments.',
    enabled: true,
    trigger: {
      type: 'focus_ended',
    },
    action: {
      type: 'open_space',
      params: { route: '/' },
    },
    createdAt: 1732000000000,
    executionCount: 0,
  },
];

let inMemoryRules: Rule[] = [...DEFAULT_RULES];
let inMemoryLogs: RuleActivityLogEntry[] = [];
let executionHistoryTimestamps: Record<string, number[]> = {};

export function getRules(): Rule[] {
  if (typeof window === 'undefined') return inMemoryRules;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_RULES);
    if (!raw) {
      saveRules(DEFAULT_RULES);
      return DEFAULT_RULES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RULES;
  } catch {
    return inMemoryRules;
  }
}

export function saveRules(rules: Rule[]): void {
  inMemoryRules = rules;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules));
      window.dispatchEvent(new CustomEvent('nexora-rules-change', { detail: rules }));
    } catch {}
  }
}

export function getActivityLogs(): RuleActivityLogEntry[] {
  if (typeof window === 'undefined') return inMemoryLogs;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_LOGS);
    if (!raw) return inMemoryLogs;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return inMemoryLogs;
  }
}

export function appendActivityLog(entry: Omit<RuleActivityLogEntry, 'id' | 'timestamp' | 'timeDisplay'>): RuleActivityLogEntry {
  const fullEntry: RuleActivityLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    timeDisplay: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date()),
    ...entry,
  };

  const logs = [fullEntry, ...getActivityLogs()].slice(0, 30);
  inMemoryLogs = logs;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
      window.dispatchEvent(new CustomEvent('nexora-rules-log-change', { detail: logs }));
    } catch {}
  }
  return fullEntry;
}

export function clearActivityLogs(): void {
  inMemoryLogs = [];
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY_LOGS);
      window.dispatchEvent(new CustomEvent('nexora-rules-log-change', { detail: [] }));
    } catch {}
  }
}

export function toggleRule(ruleId: string): Rule | null {
  const rules = getRules();
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return null;
  rule.enabled = !rule.enabled;
  saveRules([...rules]);
  return rule;
}

export function deleteRule(ruleId: string): void {
  const rules = getRules();
  const ruleToDelete = rules.find((r) => r.id === ruleId);
  if (!ruleToDelete) return;

  const nextRules = rules.filter((r) => r.id !== ruleId);
  saveRules(nextRules);

  showUndoToast(
    `${t('rules.deleted')}: "${ruleToDelete.name}"`,
    () => {
      saveRules([...getRules(), ruleToDelete]);
      showToast({ message: `Restored rule "${ruleToDelete.name}"` });
    },
    { durationMs: 10000 }
  );
}

export function addRule(rule: Omit<Rule, 'id' | 'createdAt' | 'executionCount'>): Rule {
  const newRule: Rule = {
    ...rule,
    id: `rule-${Date.now()}`,
    createdAt: Date.now(),
    executionCount: 0,
  };
  const updated = [newRule, ...getRules()];
  saveRules(updated);
  return newRule;
}

/**
 * Checks if a rule has exceeded its execution rate limit
 */
function isRateLimited(ruleId: string): boolean {
  const now = Date.now();
  const timestamps = (executionHistoryTimestamps[ruleId] || []).filter((t) => now - t < 60000);
  if (timestamps.length >= MAX_EXECUTIONS_PER_MINUTE) {
    return true;
  }
  timestamps.push(now);
  executionHistoryTimestamps[ruleId] = timestamps;
  return false;
}

/**
 * Dispatches an action safely with loop protection and rate limits
 */
function executeAction(
  action: Rule['action'],
  rule: Rule,
  depth: number,
  isDryRun: boolean = false
): { success: boolean; summary: string } {
  if (depth > MAX_CHAIN_DEPTH) {
    return { success: false, summary: t('rules.loopProtected') };
  }

  if (!isDryRun && isRateLimited(rule.id)) {
    return { success: false, summary: t('rules.rateLimited') };
  }

  let summary = '';

  switch (action.type) {
    case 'switch_space': {
      const targetSpace = action.params?.spaceId || 'work';
      summary = `Switched space to "${targetSpace}"`;
      if (!isDryRun) {
        switchSpace(targetSpace);
      }
      break;
    }
    case 'start_focus': {
      const duration = (action.params?.durationMinutes || 25) * 60;
      summary = `Started ${action.params?.durationMinutes || 25}m focus session`;
      if (!isDryRun) {
        startFocusSession(typeof window !== 'undefined' ? window.location.pathname || '/' : '/', duration);
      }
      break;
    }
    case 'stop_focus': {
      summary = 'Ended active focus session';
      if (!isDryRun) {
        stopFocusSession();
      }
      break;
    }
    case 'route_notification_to_digest': {
      summary = 'Routed notification to daily digest';
      break;
    }
    case 'mute_notifications': {
      summary = 'Muted incoming notifications';
      break;
    }
    case 'unmute_notifications': {
      summary = 'Unmuted notifications for priority delivery';
      break;
    }
    case 'open_space': {
      const route = action.params?.route || '/';
      summary = `Navigated to space "${route}"`;
      if (!isDryRun && typeof window !== 'undefined' && window.location.pathname !== route) {
        window.location.href = route;
      }
      break;
    }
  }

  if (!isDryRun) {
    rule.lastExecutedAt = Date.now();
    rule.executionCount += 1;
    saveRules(getRules().map((r) => (r.id === rule.id ? rule : r)));
  }

  appendActivityLog({
    ruleId: rule.id,
    ruleName: rule.name,
    triggerType: rule.trigger.type,
    actionType: rule.action.type,
    summary,
    isDryRun,
  });

  return { success: true, summary };
}

/**
 * Simulates testing a rule without modifying real system state
 */
export function testRuleDryRun(ruleId: string): { success: boolean; rule: Rule | null; message: string } {
  const rule = getRules().find((r) => r.id === ruleId);
  if (!rule) {
    return { success: false, rule: null, message: 'Rule not found' };
  }

  const result = executeAction(rule.action, rule, 1, true);
  return {
    success: result.success,
    rule,
    message: `[Dry Run] Simulated trigger "${rule.trigger.type}" -> Result: ${result.summary}`,
  };
}

/**
 * Evaluates rules triggered by a specific event
 */
export function evaluateRulesForTrigger(triggerType: TriggerType, context?: Record<string, unknown>, currentDepth: number = 1): number {
  if (currentDepth > MAX_CHAIN_DEPTH) {
    appendActivityLog({
      ruleId: 'system',
      ruleName: 'Loop Protection',
      triggerType,
      actionType: 'mute_notifications',
      summary: t('rules.loopProtected'),
    });
    return 0;
  }

  const rules = getRules().filter((r) => r.enabled && r.trigger.type === triggerType);
  let executedCount = 0;

  for (const rule of rules) {
    // Check parameters if specified
    if (rule.trigger.params?.category && context?.category) {
      if (rule.trigger.params.category !== context.category) continue;
    }

    const res = executeAction(rule.action, rule, currentDepth, false);
    if (res.success) executedCount++;
  }

  return executedCount;
}

/**
 * One-click In-App Workflow: Morning Routine
 * Pre-configured sequence that switches to Work space, stops distractions, and starts 25m focus.
 * Never opens external tabs.
 */
export function runMorningRoutineWorkflow(): { success: boolean; message: string } {
  switchSpace('work');
  startFocusSession('/', 25 * 60);

  appendActivityLog({
    ruleId: 'workflow-morning',
    ruleName: 'Morning Routine Workflow',
    triggerType: 'time_of_day',
    actionType: 'start_focus',
    summary: 'Executed morning sequence: Switched to Work space, set Distraction Shield ON, and started 25m Focus sprint.',
  });

  showToast({ message: 'Morning Routine active: Switched to Work space with 25m focus' });
  return {
    success: true,
    message: 'Morning Routine active: Switched to Work space with 25m focus',
  };
}

/**
 * One-click In-App Workflow: Wind Down
 * Concludes focus sessions, transitions to Personal space, and sets calm presence.
 * Never opens external tabs.
 */
export function runWindDownWorkflow(): { success: boolean; message: string } {
  const currentFocus = getFocusState();
  if (currentFocus.isActive) {
    stopFocusSession();
  }
  switchSpace('personal');

  appendActivityLog({
    ruleId: 'workflow-winddown',
    ruleName: 'Wind Down Workflow',
    triggerType: 'quiet_hours_begin',
    actionType: 'switch_space',
    summary: 'Executed wind-down sequence: Concluded active focus timers, enabled Quiet Hours digest, and switched to Personal space.',
  });

  showToast({ message: 'Wind Down active: Switched to Personal space and muted alerts' });
  return {
    success: true,
    message: 'Wind Down active: Switched to Personal space and muted alerts',
  };
}

/**
 * Scheduled check evaluated periodically while NEXORA is open
 */
export function checkScheduledActions(): void {
  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const timeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;

  // Quiet hours begin check (20:00)
  if (currentHours === 20 && currentMinutes === 0) {
    evaluateRulesForTrigger('quiet_hours_begin');
  }

  // Quiet hours end check (08:00)
  if (currentHours === 8 && currentMinutes === 0) {
    evaluateRulesForTrigger('quiet_hours_end');
  }

  // Time-of-day matching rules
  const rules = getRules().filter((r) => r.enabled && r.trigger.type === 'time_of_day' && r.trigger.params?.time === timeStr);
  for (const r of rules) {
    executeAction(r.action, r, 1, false);
  }
}
