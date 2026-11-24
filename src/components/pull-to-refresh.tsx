'use client';

import React, { useEffect, useRef, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { showToast } from '@/lib/toast-manager';

interface PullToRefreshProps {
  children: React.ReactNode;
}

export function PullToRefresh({ children }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const THRESHOLD = 65;

  const handleTouchStart = (e: React.TouchEvent) => {
    const el = containerRef.current;
    if (!el) return;

    // Only initiate pull-to-refresh if scrolled at the very top
    if (window.scrollY === 0 || el.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    } else {
      isPulling.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;

    if (diff > 0 && (window.scrollY === 0 || containerRef.current?.scrollTop === 0)) {
      // Dampen pull
      const dampened = Math.min(diff * 0.45, 100);
      setPullDistance(dampened);

      if (dampened >= THRESHOLD && pullDistance < THRESHOLD) {
        triggerHaptic('tick');
      }
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      triggerHaptic('success');

      // Refresh strictly local data only
      window.dispatchEvent(new CustomEvent('nexora-timeline-change'));
      window.dispatchEvent(new CustomEvent('nexora-focus-change'));
      window.dispatchEvent(new CustomEvent('nexora-rules-evaluate'));

      showToast({
        message: 'Local data refreshed',
        detail: 'Timeline and focus status updated from local cache.',
        type: 'info',
        durationMs: 3000,
      });

      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 700);
    } else {
      setPullDistance(0);
    }
  };

  return (
    <div
      ref={containerRef}
      className="pull-to-refresh-container"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        overscrollBehaviorY: 'contain',
        position: 'relative',
        minHeight: '100%',
      }}
    >
      {/* Pull Indicator */}
      {pullDistance > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="pull-to-refresh-indicator"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `${pullDistance}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg, #f4f3ed)',
            color: 'var(--muted, #6b7264)',
            fontSize: '0.8125rem',
            overflow: 'hidden',
            zIndex: 40,
            transition: isPulling.current ? 'none' : 'height 0.2s ease-out',
            borderBottom: pullDistance >= THRESHOLD ? '1px solid var(--border, #e3e2d8)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                display: 'inline-block',
                transform: `rotate(${Math.min((pullDistance / THRESHOLD) * 180, 180)}deg)`,
                transition: 'transform 0.15s',
              }}
            >
              ↓
            </span>
            <span>
              {isRefreshing
                ? 'Refreshing local data…'
                : pullDistance >= THRESHOLD
                ? 'Release to refresh local data'
                : 'Pull down to refresh local data'}
            </span>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
