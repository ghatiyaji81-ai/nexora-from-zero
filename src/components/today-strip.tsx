'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  clearDemoData,
  defaultTimelineProvider,
  isDemoDataActive,
  restoreDemoData,
  TimelineCategory,
  TimelineItem,
} from '@/lib/timeline-data';
import { showToast } from '@/lib/toast-manager';

export function TodayStrip() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<TimelineCategory | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [, startTransition] = useTransition();

  const [hasDemoActive, setHasDemoActive] = useState(true);

  const reloadFeed = () => {
    setHasDemoActive(isDemoDataActive());
    defaultTimelineProvider.getItems('all').then(data => {
      setItems(data);
      setIsLoading(false);
    });
  };

  useEffect(() => {
    let mounted = true;
    setHasDemoActive(isDemoDataActive());
    defaultTimelineProvider.getItems('all').then(data => {
      if (mounted) {
        setItems(data);
        setIsLoading(false);
      }
    });

    const handleFeedChange = () => reloadFeed();
    window.addEventListener('nexora-timeline-change', handleFeedChange);

    return () => {
      mounted = false;
      window.removeEventListener('nexora-timeline-change', handleFeedChange);
    };
  }, []);

  const handleToggleDemoData = () => {
    if (hasDemoActive) {
      clearDemoData();
      showToast({
        message: 'Sample demo data removed',
        detail: 'Your timeline is now in clean mode. You can restore sample data anytime.',
        type: 'info',
        undoLabel: 'Undo',
        undoAction: () => restoreDemoData(),
      });
    } else {
      restoreDemoData();
      showToast({
        message: 'Sample demo data restored',
        type: 'success',
      });
    }
  };

  const counts = {
    all: items.length,
    unread: items.filter(i => i.category === 'unread').length,
    task: items.filter(i => i.category === 'task').length,
    github: items.filter(i => i.category === 'github').length,
    calendar: items.filter(i => i.category === 'calendar').length,
  };

  const filteredItems = activeFilter === 'all'
    ? items
    : items.filter(i => i.category === activeFilter);

  const handleToggleTask = async (id: string, currentCompleted?: boolean) => {
    startTransition(async () => {
      const updated = await defaultTimelineProvider.toggleTask(id);
      if (updated) {
        setItems(prev => prev.map(item => item.id === id ? updated : item));
        showToast({
          message: updated.isCompleted ? 'Task completed' : 'Task reopened',
          detail: updated.title,
          type: 'success',
          undoLabel: 'Undo',
          undoAction: async () => {
            const reverted = await defaultTimelineProvider.toggleTask(id);
            if (reverted) {
              setItems(prev => prev.map(item => item.id === id ? reverted : item));
            }
          },
        });
      }
    });
  };

  const handleMarkRead = async (id: string) => {
    startTransition(async () => {
      const updated = await defaultTimelineProvider.markAsRead(id);
      if (updated) {
        setItems(prev => prev.map(item => item.id === id ? updated : item));
        showToast({
          message: 'Marked as read',
          detail: updated.title,
          type: 'info',
        });
      }
    });
  };

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <section className="today-strip" aria-labelledby="today-strip-heading">
      {/* Strip Topline */}
      <div className="today-header">
        <div className="today-header-left">
          <div className="today-eyebrow-row">
            <span className="card-kicker">TODAY · UNIFIED TIMELINE</span>
            <span
              className="timeline-mock-tag"
              title="Demonstration feed. Connected to a clean data-layer interface ready for real APIs."
            >
              Sample data
            </span>
          </div>
          <h2 id="today-strip-heading" className="today-title">
            One quiet feed for your day.
          </h2>
        </div>

        <div className="today-header-right">
          <button
            type="button"
            className="timeline-demo-toggle-btn"
            onClick={handleToggleDemoData}
            title={hasDemoActive ? 'Remove sample data from timeline' : 'Restore sample data to timeline'}
          >
            {hasDemoActive ? 'Clear sample data' : 'Restore sample data'}
          </button>
          <div className="today-date-chip">
            <span className="today-date-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </span>
            <span>{todayFormatted}</span>
          </div>
        </div>
      </div>

      {/* Filter Navigation */}
      <div className="today-filter-bar" role="tablist" aria-label="Filter timeline items by category">
        {(
          [
            { id: 'all', label: 'All', count: counts.all },
            { id: 'unread', label: 'Unread', count: counts.unread },
            { id: 'task', label: 'Tasks', count: counts.task },
            { id: 'github', label: 'GitHub', count: counts.github },
            { id: 'calendar', label: 'Calendar', count: counts.calendar },
          ] as const
        ).map(tab => {
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={`today-filter-btn${isActive ? ' is-active' : ''}`}
              onClick={() => setActiveFilter(tab.id)}
            >
              <span>{tab.label}</span>
              <span className="today-filter-count">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Timeline Feed Container */}
      <div
        className="today-feed"
        role="feed"
        aria-busy={isLoading}
        aria-label="Today's chronological timeline"
      >
        {filteredItems.length === 0 ? (
          <div className="timeline-empty-state">
            <div className="timeline-empty-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="9" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <h3>All caught up</h3>
            <p>No {activeFilter === 'all' ? 'activity' : activeFilter} items for today. Take a breath or start a quiet focus session.</p>
          </div>
        ) : (
          filteredItems.map(item => {
            const isTask = item.category === 'task';
            const isUnread = item.category === 'unread';

            return (
              <article
                key={item.id}
                className={`timeline-item timeline-item-${item.category}${item.isCompleted ? ' is-completed' : ''}${isUnread && !item.isRead ? ' is-unread' : ''}`}
                aria-labelledby={`timeline-item-title-${item.id}`}
              >
                {/* Time & Category Icon Column */}
                <div className="timeline-item-meta">
                  <span className="timeline-item-time">{item.timeDisplay}</span>
                  <div className={`timeline-cat-badge timeline-cat-${item.category}`} title={item.source}>
                    {item.category === 'calendar' && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    )}
                    {item.category === 'task' && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    )}
                    {item.category === 'github' && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="18" r="3" />
                        <circle cx="6" cy="6" r="3" />
                        <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                        <line x1="6" y1="9" x2="6" y2="21" />
                      </svg>
                    )}
                    {item.category === 'unread' && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Content Column */}
                <div className="timeline-item-body">
                  <div className="timeline-item-topline">
                    <span className="timeline-source-badge">{item.sourceBadge}</span>
                    <span className="timeline-item-sample-tag" title={item.sampleNotice}>
                      Sample data
                    </span>
                    {item.actor && (
                      <span className="timeline-actor-pill">
                        {item.actor.name} <small>({item.actor.role})</small>
                      </span>
                    )}
                  </div>

                  <h3 id={`timeline-item-title-${item.id}`} className="timeline-item-title">
                    {item.title}
                  </h3>
                  <p className="timeline-item-snippet">{item.snippet}</p>
                </div>

                {/* Action Buttons Column */}
                <div className="timeline-item-actions">
                  {isTask && (
                    <button
                      type="button"
                      className={`timeline-action-btn timeline-task-toggle${item.isCompleted ? ' is-checked' : ''}`}
                      onClick={() => handleToggleTask(item.id, item.isCompleted)}
                      aria-label={item.isCompleted ? `Done: ${item.title}` : `Mark done: ${item.title}`}
                    >
                      <span className="timeline-checkbox-indicator" aria-hidden="true">
                        {item.isCompleted ? '✓' : ''}
                      </span>
                      <span>{item.isCompleted ? 'Done' : 'Mark done'}</span>
                    </button>
                  )}

                  {isUnread && !item.isRead && (
                    <button
                      type="button"
                      className="timeline-action-btn timeline-read-btn"
                      onClick={() => handleMarkRead(item.id)}
                      aria-label={`Mark read: ${item.title}`}
                    >
                      Mark read
                    </button>
                  )}

                  <Link
                    href={item.actionHref}
                    className="timeline-action-link"
                    aria-label={`${item.actionLabel} for ${item.title}`}
                  >
                    <span>{item.actionLabel}</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
