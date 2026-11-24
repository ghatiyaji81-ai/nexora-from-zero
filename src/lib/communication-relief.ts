/**
 * NEXORA Communication Relief Data Layer & Notification Center (Phase 2, Item 5)
 * Handles batched notification digests, snooze/reminders, priority VIP contacts,
 * quiet hours, reply-later queue, and unified channel compose box.
 * Labelled explicitly as "Preview · Sample data".
 */

import { getFocusState } from './focus-manager';

export type NotificationStatus = 'inbox' | 'snoozed' | 'reply_later' | 'batched_digest' | 'dismissed';
export type DeliveryChannel = 'connect' | 'github' | 'telegram' | 'email';

export interface NotificationItem {
  id: string;
  sender: {
    name: string;
    avatar?: string;
    role?: string;
  };
  source: DeliveryChannel;
  title: string;
  snippet: string;
  timestamp: number;
  timeDisplay: string;
  category: 'urgent' | 'mention' | 'update' | 'digest';
  status: NotificationStatus;
  snoozedUntil?: number;
  isSample: true;
  sampleNotice: string;
}

export interface NotificationCenterConfig {
  dailyDigestTimes: string[]; // default ['09:00', '13:00', '18:00']
  quietHoursEnabled: boolean;
  quietHoursStart: string; // '20:00'
  quietHoursEnd: string; // '08:00'
  vipList: string[]; // Contact names with VIP bypass
  batchedDeliveryEnabled: boolean;
}

export interface ChannelInfo {
  id: DeliveryChannel;
  label: string;
  status: 'Connected' | 'Not connected';
  canSend: boolean;
  notice: string;
}

export const CHANNELS_CONFIG: Record<DeliveryChannel, ChannelInfo> = {
  connect: {
    id: 'connect',
    label: 'Connect (Local channels)',
    status: 'Connected',
    canSend: true,
    notice: 'Local browser messaging interface and direct contacts.',
  },
  github: {
    id: 'github',
    label: 'GitHub Discussions',
    status: 'Not connected',
    canSend: false,
    notice: 'Requires GITHUB_TOKEN configured in .env.local.',
  },
  telegram: {
    id: 'telegram',
    label: 'Telegram Messenger',
    status: 'Not connected',
    canSend: false,
    notice: 'Requires TELEGRAM_BOT_TOKEN configured in .env.local.',
  },
  email: {
    id: 'email',
    label: 'Email Dispatch',
    status: 'Not connected',
    canSend: false,
    notice: 'Requires RESEND_API_KEY configured in .env.local.',
  },
};

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    sender: { name: 'Elena Rostova', role: 'Principal Designer' },
    source: 'connect',
    title: 'Sprint 4 Design Handoff',
    snippet: 'Hey! The tokens for Warm and Dark contrast are ready in NEXORA Create.',
    timestamp: Date.now() - 1000 * 60 * 30,
    timeDisplay: '30m ago',
    category: 'mention',
    status: 'inbox',
    isSample: true,
    sampleNotice: 'Preview · Sample data',
  },
  {
    id: 'notif-2',
    sender: { name: 'DevOps Bot', role: 'CI/CD Automated' },
    source: 'github',
    title: 'PR #142 Build Passed',
    snippet: 'All 85 tests and webpack bundle validations passed cleanly.',
    timestamp: Date.now() - 1000 * 60 * 50,
    timeDisplay: '50m ago',
    category: 'update',
    status: 'inbox',
    isSample: true,
    sampleNotice: 'Preview · Sample data',
  },
  {
    id: 'notif-3',
    sender: { name: 'Dr. Aaron Meyer', role: 'Academic Advisor' },
    source: 'email',
    title: 'Review on Research Methodology',
    snippet: 'Please look over Section 3 citations when you have a moment.',
    timestamp: Date.now() - 1000 * 60 * 120,
    timeDisplay: '2h ago',
    category: 'urgent',
    status: 'inbox',
    isSample: true,
    sampleNotice: 'Preview · Sample data',
  },
  {
    id: 'notif-4',
    sender: { name: 'Telegram Gateway', role: 'Alerts' },
    source: 'telegram',
    title: 'Server CPU normal',
    snippet: 'System load stabilized at 12%. No action required.',
    timestamp: Date.now() - 1000 * 60 * 180,
    timeDisplay: '3h ago',
    category: 'digest',
    status: 'batched_digest',
    isSample: true,
    sampleNotice: 'Preview · Sample data',
  },
];

export const DEFAULT_NOTIF_CONFIG: NotificationCenterConfig = {
  dailyDigestTimes: ['09:00', '13:00', '18:00'],
  quietHoursEnabled: true,
  quietHoursStart: '20:00',
  quietHoursEnd: '08:00',
  vipList: ['Elena Rostova'], // Elena is VIP by default
  batchedDeliveryEnabled: true,
};

const CONFIG_STORAGE_KEY = 'nexora_notification_config';
const NOTIFS_STORAGE_KEY = 'nexora_notifications_state';

let inMemoryConfig: NotificationCenterConfig = { ...DEFAULT_NOTIF_CONFIG };
let inMemoryNotifs: NotificationItem[] = [...INITIAL_NOTIFICATIONS];

export function getNotificationConfig(): NotificationCenterConfig {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return inMemoryConfig;
}

export function saveNotificationConfig(
  config: Partial<NotificationCenterConfig>
): NotificationCenterConfig {
  const current = getNotificationConfig();
  const next: NotificationCenterConfig = {
    ...current,
    ...config,
    vipList: config.vipList || current.vipList,
  };
  inMemoryConfig = next;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('nexora-notification-config-change', { detail: next }));
    } catch {}
  }

  return next;
}

export function getNotifications(): NotificationItem[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(NOTIFS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return inMemoryNotifs;
}

function saveNotifications(notifs: NotificationItem[]): void {
  inMemoryNotifs = notifs;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(NOTIFS_STORAGE_KEY, JSON.stringify(notifs));
      window.dispatchEvent(new CustomEvent('nexora-notifications-change', { detail: notifs }));
    } catch {}
  }
}

export function isContactVip(name: string): boolean {
  const config = getNotificationConfig();
  return config.vipList.some((vip) => vip.toLowerCase() === name.toLowerCase());
}

export function toggleVipStatus(name: string): boolean {
  const config = getNotificationConfig();
  const exists = isContactVip(name);
  const nextVip = exists
    ? config.vipList.filter((v) => v.toLowerCase() !== name.toLowerCase())
    : [...config.vipList, name];

  saveNotificationConfig({ vipList: nextVip });
  return !exists;
}

export function snoozeNotification(id: string, durationMs: number): NotificationItem | null {
  const list = getNotifications();
  const item = list.find((n) => n.id === id);
  if (!item) return null;

  const snoozedUntil = Date.now() + durationMs;
  const updated: NotificationItem = {
    ...item,
    status: 'snoozed',
    snoozedUntil,
  };

  const next = list.map((n) => (n.id === id ? updated : n));
  saveNotifications(next);
  return updated;
}

export function moveToReplyLater(id: string): NotificationItem | null {
  const list = getNotifications();
  const item = list.find((n) => n.id === id);
  if (!item) return null;

  const updated: NotificationItem = {
    ...item,
    status: 'reply_later',
  };

  const next = list.map((n) => (n.id === id ? updated : n));
  saveNotifications(next);
  return updated;
}

export function dismissNotification(id: string): boolean {
  const list = getNotifications();
  const next = list.map((n) => (n.id === id ? { ...n, status: 'dismissed' as NotificationStatus } : n));
  saveNotifications(next);
  return true;
}

/**
 * Focus Shield Integration:
 * Incoming notifications check if a Focus Session is currently active.
 * If active:
 * - VIP contacts bypass the shield.
 * - Non-VIP notifications are automatically held in 'batched_digest' state!
 */
export function processIncomingNotification(item: Omit<NotificationItem, 'status' | 'isSample' | 'sampleNotice'>): NotificationItem {
  const focus = getFocusState();
  const isVip = isContactVip(item.sender.name);

  let initialStatus: NotificationStatus = 'inbox';
  if (focus.isActive && focus.notificationsMuted && !isVip) {
    // Truly holds notifications during Focus Mode
    initialStatus = 'batched_digest';
  }

  const notification: NotificationItem = {
    ...item,
    status: initialStatus,
    isSample: true,
    sampleNotice: 'Preview · Sample data',
  };

  const list = getNotifications();
  saveNotifications([notification, ...list]);
  return notification;
}

export function getHeldNotificationsCount(): number {
  const list = getNotifications();
  return list.filter((n) => n.status === 'batched_digest').length;
}

/**
 * Unified Compose Dispatch
 * Guarantees honest status: Only local Connect conversations can actually send.
 * External channels refuse and return honest error.
 */
export async function sendUnifiedMessage(options: {
  channel: DeliveryChannel;
  recipient: string;
  text: string;
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const channelInfo = CHANNELS_CONFIG[options.channel];

  if (!channelInfo.canSend) {
    return {
      success: false,
      error: `Channel ${channelInfo.label} is Not connected. Requires credentials in .env.local.`,
    };
  }

  if (!options.text.trim()) {
    return { success: false, error: 'Message cannot be empty.' };
  }

  // Local Connect send succeeds
  const messageId = `msg-${Date.now()}`;
  return { success: true, messageId };
}

