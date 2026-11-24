import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNELS_CONFIG,
  dismissNotification,
  getNotificationConfig,
  getNotifications,
  INITIAL_NOTIFICATIONS,
  isContactVip,
  moveToReplyLater,
  processIncomingNotification,
  saveNotificationConfig,
  sendUnifiedMessage,
  snoozeNotification,
  toggleVipStatus,
} from '../src/lib/communication-relief';
import { startFocusSession, stopFocusSession } from '../src/lib/focus-manager';

test('Communication Relief - initial notifications have isSample: true and honest preview disclosures', () => {
  const notifs = getNotifications();
  assert.ok(notifs.length >= 4);

  for (const item of notifs) {
    assert.strictEqual(item.isSample, true);
    assert.ok(item.sampleNotice.includes('Preview · Sample data'));
    assert.ok(['inbox', 'snoozed', 'reply_later', 'batched_digest', 'dismissed'].includes(item.status));
  }
});

test('Communication Relief - snoozes notification and moves to reply-later queue', () => {
  const notifs = getNotifications();
  const target = notifs[0];

  // Snooze
  const snoozed = snoozeNotification(target.id, 3 * 60 * 60 * 1000);
  assert.ok(snoozed);
  assert.equal(snoozed.status, 'snoozed');
  assert.ok(typeof snoozed.snoozedUntil === 'number');

  // Reply later
  const replyLater = moveToReplyLater(target.id);
  assert.ok(replyLater);
  assert.equal(replyLater.status, 'reply_later');

  // Dismiss
  const dismissed = dismissNotification(target.id);
  assert.equal(dismissed, true);
});

test('Communication Relief - VIP list and Focus Mode muting/digest bypass', () => {
  saveNotificationConfig({ vipList: ['Elena Rostova'] });
  assert.equal(isContactVip('Elena Rostova'), true);
  assert.equal(isContactVip('Unknown Contact'), false);

  // Toggle VIP
  const isNowVip = toggleVipStatus('New VIP');
  assert.equal(isNowVip, true);
  assert.equal(isContactVip('New VIP'), true);
  toggleVipStatus('New VIP'); // Revert

  // When Focus Session is active:
  startFocusSession('/connect', 25 * 60);

  // 1. Non-VIP notification is held in batched_digest
  const normalNotif = processIncomingNotification({
    id: `test-normal-${Date.now()}`,
    sender: { name: 'Random User' },
    source: 'connect',
    title: 'Casual chat',
    snippet: 'Hey are you free?',
    timestamp: Date.now(),
    timeDisplay: 'Just now',
    category: 'mention',
  });
  assert.equal(normalNotif.status, 'batched_digest', 'Non-VIP must be held in batched_digest during focus');

  // 2. VIP notification bypasses focus shield
  const vipNotif = processIncomingNotification({
    id: `test-vip-${Date.now()}`,
    sender: { name: 'Elena Rostova' },
    source: 'connect',
    title: 'Urgent design token sync',
    snippet: 'Blocker on accessibility contrast',
    timestamp: Date.now(),
    timeDisplay: 'Just now',
    category: 'urgent',
  });
  assert.equal(vipNotif.status, 'inbox', 'VIP notification must bypass focus shield into inbox');

  stopFocusSession();
});

test('Communication Relief - unified compose dispatch enforces honest channel status', async () => {
  // 1. Local Connect send succeeds
  const localSend = await sendUnifiedMessage({
    channel: 'connect',
    recipient: 'Elena Rostova',
    text: 'Reviewing the contrast tokens now.',
  });
  assert.equal(localSend.success, true);
  assert.ok(localSend.messageId);

  // 2. External unconfigured channels must refuse to send and report honest notice
  const externalChannels = ['github', 'telegram', 'email'] as const;
  for (const ch of externalChannels) {
    const config = CHANNELS_CONFIG[ch];
    assert.equal(config.status, 'Not connected');
    assert.equal(config.canSend, false);

    const extSend = await sendUnifiedMessage({
      channel: ch,
      recipient: '#general',
      text: 'Trying to send externally',
    });
    assert.equal(extSend.success, false);
    assert.ok(extSend.error && extSend.error.includes('Not connected'));
  }

  // 3. Empty text rejected
  const emptySend = await sendUnifiedMessage({
    channel: 'connect',
    recipient: 'Test',
    text: '   ',
  });
  assert.equal(emptySend.success, false);
});

