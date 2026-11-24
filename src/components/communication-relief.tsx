'use client';

import React, { useEffect, useState } from 'react';
import {
  CHANNELS_CONFIG,
  DeliveryChannel,
  dismissNotification,
  getNotificationConfig,
  getNotifications,
  isContactVip,
  moveToReplyLater,
  NotificationItem,
  NotificationStatus,
  sendUnifiedMessage,
  snoozeNotification,
  toggleVipStatus,
} from '@/lib/communication-relief';
import { getFocusState } from '@/lib/focus-manager';
import { showToast } from '@/lib/toast-manager';
import { t } from '@/lib/i18n-strings';
import { SwipableItem } from '@/components/swipable-item';

export function CommunicationRelief() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => getNotifications());
  const [activeTab, setActiveTab] = useState<'inbox' | 'digest' | 'reply_later' | 'snoozed'>('inbox');
  const [focusActive, setFocusActive] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<DeliveryChannel>('connect');
  const [recipient, setRecipient] = useState('');
  const [composeText, setComposeText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const refreshData = () => {
    setNotifications(getNotifications());
    setFocusActive(getFocusState().isActive);
  };

  useEffect(() => {
    refreshData();

    const handleNotifChange = () => refreshData();
    window.addEventListener('nexora-notifications-change', handleNotifChange);
    window.addEventListener('nexora-focus-state-change', handleNotifChange);

    return () => {
      window.removeEventListener('nexora-notifications-change', handleNotifChange);
      window.removeEventListener('nexora-focus-state-change', handleNotifChange);
    };
  }, []);

  const handleSnooze = (id: string, hours: number) => {
    const updated = snoozeNotification(id, hours * 60 * 60 * 1000);
    if (updated) {
      refreshData();
      showToast({
        message: `Notification snoozed for ${hours}h`,
        detail: updated.title,
        type: 'info',
      });
    }
  };

  const handleReplyLater = (id: string) => {
    const updated = moveToReplyLater(id);
    if (updated) {
      refreshData();
      showToast({
        message: t('comm.replyLaterMoved'),
        detail: updated.title,
        type: 'info',
      });
    }
  };

  const handleDismiss = (id: string) => {
    dismissNotification(id);
    refreshData();
  };

  const handleToggleVip = (name: string) => {
    const isNowVip = toggleVipStatus(name);
    refreshData();
    showToast({
      message: isNowVip ? `Added ${name} to VIP Priority list` : `Removed ${name} from VIP list`,
      detail: isNowVip ? 'Messages from this contact will bypass Focus Shield.' : undefined,
      type: 'info',
    });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    const result = await sendUnifiedMessage({
      channel: selectedChannel,
      recipient,
      text: composeText,
    });

    setIsSending(false);

    if (result.success) {
      setComposeText('');
      setRecipient('');
      showToast({
        message: 'Message sent via Connect (Local channel)',
        type: 'success',
      });
    } else {
      showToast({
        message: result.error || 'Failed to send',
        detail: 'Configure external channels in .env.local to enable dispatch.',
        type: 'info',
      });
    }
  };

  const filteredNotifs = notifications.filter((n) => {
    if (activeTab === 'inbox') return n.status === 'inbox';
    if (activeTab === 'digest') return n.status === 'batched_digest';
    if (activeTab === 'reply_later') return n.status === 'reply_later';
    if (activeTab === 'snoozed') return n.status === 'snoozed';
    return false;
  });

  const counts = {
    inbox: notifications.filter((n) => n.status === 'inbox').length,
    digest: notifications.filter((n) => n.status === 'batched_digest').length,
    reply_later: notifications.filter((n) => n.status === 'reply_later').length,
    snoozed: notifications.filter((n) => n.status === 'snoozed').length,
  };

  const activeChannelInfo = CHANNELS_CONFIG[selectedChannel];

  return (
    <div className="comm-relief-card" aria-labelledby="comm-relief-heading">
      {/* Top Header */}
      <div className="comm-relief-header">
        <div>
          <div className="comm-eyebrow-row">
            <span className="card-kicker">COMMUNICATION RELIEF</span>
            <span className="timeline-mock-tag" title="Demonstration feed. Connected to a clean data interface.">
              {t('common.sampleData')}
            </span>
          </div>
          <h3 id="comm-relief-heading" className="comm-title">
            Quiet Notification Batches & Compose
          </h3>
        </div>

        {focusActive && (
          <div className="comm-focus-shield-badge" role="status">
            <span className="comm-pulse-dot" />
            <span>Focus Active: Digest holding notifications</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="comm-tabs" role="tablist" aria-label="Notification center categories">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'inbox'}
          className={`comm-tab-btn ${activeTab === 'inbox' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('inbox')}
        >
          Inbox ({counts.inbox})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'digest'}
          className={`comm-tab-btn ${activeTab === 'digest' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('digest')}
        >
          Daily Digest ({counts.digest})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'reply_later'}
          className={`comm-tab-btn ${activeTab === 'reply_later' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('reply_later')}
        >
          Reply Later ({counts.reply_later})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'snoozed'}
          className={`comm-tab-btn ${activeTab === 'snoozed' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('snoozed')}
        >
          Snoozed ({counts.snoozed})
        </button>
      </div>

      {/* Digest Info Banner */}
      {activeTab === 'digest' && (
        <div className="comm-digest-banner">
          <span>⏰ <strong>{t('comm.digestTimes')}</strong> — Notifications quietly batch here to protect your focus.</span>
        </div>
      )}

      {/* Notification Stream */}
      <div className="comm-notif-feed" role="feed" aria-label="Notification stream">
        {filteredNotifs.length === 0 ? (
          <div className="comm-empty-state">
            <p>No notifications in this queue. Everything is quiet.</p>
          </div>
        ) : (
          filteredNotifs.map((item) => {
            const isVip = isContactVip(item.sender.name);
            return (
              <SwipableItem
                key={item.id}
                onSwipeArchive={() => handleDismiss(item.id)}
                onSwipeSnooze={() => handleSnooze(item.id, 3)}
                archiveLabel="Dismiss"
                snoozeLabel="Snooze 3h"
              >
                <article className="comm-notif-item">
                  <div className="comm-notif-main">
                    <div className="comm-notif-topline">
                      <span className="comm-sender-name">{item.sender.name}</span>
                      {isVip && (
                        <span className="comm-vip-badge" title="VIP bypass active">
                          VIP ⭐
                        </span>
                      )}
                      <span className="comm-channel-tag">{item.source}</span>
                      <span className="comm-time">{item.timeDisplay}</span>
                    </div>
                    <h4 className="comm-item-title">{item.title}</h4>
                    <p className="comm-item-snippet">{item.snippet}</p>
                  </div>

                  <div className="comm-notif-actions">
                    <button
                      type="button"
                      className="comm-action-btn"
                      onClick={() => handleSnooze(item.id, 3)}
                      title="Snooze for 3 hours"
                      aria-label={`Snooze 3h: ${item.title}`}
                    >
                      Snooze 3h
                    </button>
                    <button
                      type="button"
                      className="comm-action-btn"
                      onClick={() => handleReplyLater(item.id)}
                      title="Move to Reply Later queue"
                      aria-label={`Reply later: ${item.title}`}
                    >
                      Reply later
                    </button>
                    <button
                      type="button"
                      className={`comm-action-btn ${isVip ? 'is-vip' : ''}`}
                      onClick={() => handleToggleVip(item.sender.name)}
                      title={isVip ? 'Remove VIP priority' : 'Mark as VIP (bypasses focus shield)'}
                      aria-label={`VIP: ${isVip ? 'remove priority for' : 'mark priority for'} ${item.sender.name}`}
                    >
                      <span aria-hidden="true">{isVip ? '★ ' : '☆ '}</span>VIP
                    </button>
                    <button
                      type="button"
                      className="comm-action-btn comm-dismiss-btn"
                      onClick={() => handleDismiss(item.id)}
                      aria-label={`Dismiss: ${item.title}`}
                      title="Dismiss notification"
                    >
                      ×
                    </button>
                  </div>
                </article>
              </SwipableItem>
            );
          })
        )}
      </div>

      {/* Unified Compose Box */}
      <div className="comm-compose-section">
        <h4 className="comm-compose-title">{t('comm.composeTitle')}</h4>

        {/* Channel Selector */}
        <div className="comm-channel-pills" role="radiogroup" aria-label="Select delivery channel">
          {(Object.keys(CHANNELS_CONFIG) as DeliveryChannel[]).map((ch) => {
            const info = CHANNELS_CONFIG[ch];
            const isSelected = selectedChannel === ch;
            return (
              <button
                key={ch}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`comm-channel-pill ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelectedChannel(ch)}
              >
                <span>{info.label}</span>
                <span className={`channel-status-dot ${info.canSend ? 'dot-connected' : 'dot-disconnected'}`} />
              </button>
            );
          })}
        </div>

        {/* Channel Disconnection Notice */}
        {!activeChannelInfo.canSend && (
          <div className="comm-channel-warning" role="note">
            <span>⚠ <strong>{activeChannelInfo.label}: Not connected</strong>. {activeChannelInfo.notice}</span>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="comm-compose-form">
          <input
            type="text"
            placeholder="Recipient (e.g. Elena Rostova or #general)…"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="comm-compose-input"
            aria-label="Recipient"
          />
          <textarea
            placeholder={`Type your message for ${activeChannelInfo.label}…`}
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            className="comm-compose-textarea"
            rows={2}
            aria-label="Message text"
          />
          <div className="comm-compose-footer">
            <span className="comm-compose-hint">
              {activeChannelInfo.canSend
                ? 'Ready to send locally in Connect.'
                : 'External dispatch disabled (Not connected).'}
            </span>
            <button
              type="submit"
              disabled={isSending}
              className={`comm-send-btn ${!activeChannelInfo.canSend ? 'btn-disabled' : ''}`}
            >
              {isSending ? 'Sending…' : t('comm.sendAction')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

