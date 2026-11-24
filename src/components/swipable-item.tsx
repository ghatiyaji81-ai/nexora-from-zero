'use client';

import React, { useRef, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';

export interface SwipableItemProps {
  children: React.ReactNode;
  onSwipeArchive?: () => void;
  onSwipeSnooze?: () => void;
  archiveLabel?: string;
  snoozeLabel?: string;
  className?: string;
}

export function SwipableItem({
  children,
  onSwipeArchive,
  onSwipeSnooze,
  archiveLabel = 'Archive',
  snoozeLabel = 'Snooze',
  className = '',
}: SwipableItemProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; isEdge: boolean } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    // Prevent clashing with browser back/forward swipe from screen edges
    const isEdge = x < 32 || (typeof window !== 'undefined' && x > window.innerWidth - 32);
    touchStartRef.current = { x, y, isEdge };
    setSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || touchStartRef.current.isEdge) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // If predominantly vertical scroll, ignore
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    // Limit maximum drag distance with damping
    const damped = Math.sign(deltaX) * Math.min(Math.abs(deltaX) * 0.65, 80);
    setOffsetX(damped);
  };

  const handleTouchEnd = () => {
    if (touchStartRef.current && !touchStartRef.current.isEdge) {
      if (offsetX < -45 && onSwipeArchive) {
        triggerHaptic('warn');
        onSwipeArchive();
      } else if (offsetX > 45 && onSwipeSnooze) {
        triggerHaptic('tick');
        onSwipeSnooze();
      }
    }
    setOffsetX(0);
    setSwiping(false);
    touchStartRef.current = null;
  };

  return (
    <div
      className={`swipable-container ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {/* Background action hints visible during swipe */}
      <div
        className="swipable-action-hint hint-snooze"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: '70px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'color-mix(in srgb, var(--accent) 20%, var(--surface))',
          color: 'var(--accent)',
          fontSize: '0.75rem',
          fontWeight: 600,
          opacity: offsetX > 25 ? 1 : 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        💤 {snoozeLabel}
      </div>

      <div
        className="swipable-action-hint hint-archive"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '70px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'color-mix(in srgb, var(--ink) 12%, var(--surface))',
          color: 'var(--ink)',
          fontSize: '0.75rem',
          fontWeight: 600,
          opacity: offsetX < -25 ? 1 : 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        📦 {archiveLabel}
      </div>

      {/* Foreground card */}
      <div
        className="swipable-content"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
