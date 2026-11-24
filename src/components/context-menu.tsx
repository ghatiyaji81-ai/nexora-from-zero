'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { copyTextWithFeedback } from '@/lib/micro-feedback';
import { startFocusSession, stopFocusSession } from '@/lib/focus-manager';
import { showUndoToast } from '@/lib/toast-manager';

export interface ContextMenuTarget {
  href: string;
  label: string;
  x: number;
  y: number;
}

export function ContextMenu() {
  const router = useRouter();
  const [menu, setMenu] = useState<ContextMenuTarget | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);

  function openMenuForElement(target: HTMLElement, clientX: number, clientY: number) {
    let href = target.getAttribute('data-href') || target.getAttribute('href');
    if (!href) {
      const link = target.querySelector<HTMLAnchorElement>('a');
      if (link) href = link.getAttribute('href');
    }

    let label = target.getAttribute('data-label');
    if (!label) {
      const textEl = target.querySelector('span, strong, h3');
      if (textEl) label = textEl.textContent?.trim() || 'Workspace';
    }

    if (!href) return;

    triggerElementRef.current = target;

    const menuWidth = 210;
    const menuHeight = 180;
    const x = Math.min(clientX, window.innerWidth - menuWidth - 16);
    const y = Math.min(clientY, window.innerHeight - menuHeight - 16);

    setMenu({
      href,
      label: label || 'Workspace',
      x: Math.max(12, x),
      y: Math.max(12, y),
    });
    setActiveIndex(0);
  }

  function closeMenu() {
    setMenu(null);
    // Return focus to the trigger element on close
    if (triggerElementRef.current) {
      triggerElementRef.current.focus();
    }
  }

  useEffect(() => {
    function handleContextMenu(e: MouseEvent) {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-context-menu], .sidebar-item-row, .nav-link, .product-card'
      );

      if (!target) {
        if (menu) closeMenu();
        return;
      }

      e.preventDefault();
      openMenuForElement(target, e.clientX, e.clientY);
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Shift + F10 or ContextMenu key opens menu on currently active/focused element
      if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
        const activeEl = document.activeElement as HTMLElement | null;
        const target = activeEl?.closest<HTMLElement>(
          '[data-context-menu], .sidebar-item-row, .nav-link, .product-card'
        );

        if (target) {
          e.preventDefault();
          const rect = target.getBoundingClientRect();
          openMenuForElement(target, rect.left + rect.width / 2, rect.bottom);
          return;
        }
      }

      if (!menu) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % 4);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + 4) % 4);
      }
    }

    function handleGlobalClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }

    function handleScroll() {
      if (menu) closeMenu();
    }

    // Touch device long-press support (500ms touch timer)
    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-context-menu], .sidebar-item-row, .nav-link, .product-card'
      );
      if (!target) return;

      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchTimerRef.current = setTimeout(() => {
        openMenuForElement(target, touch.clientX, touch.clientY);
      }, 500);
    }

    function handleTouchEnd() {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
    }

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchmove', handleTouchEnd);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchmove', handleTouchEnd);
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    };
  }, [menu]);

  if (!menu) return null;

  const handleOpen = () => {
    router.push(menu.href);
    closeMenu();
  };

  const handleFocusOnSpace = () => {
    startFocusSession(menu.href, 25 * 60);
    router.push(menu.href);
    closeMenu();
    showUndoToast(`Focus session started on ${menu.label}`, () => {
      stopFocusSession();
    }, {
      undoLabel: 'End',
      durationMs: 8000,
    });
  };

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}${menu.href}`;
    copyTextWithFeedback(fullUrl, `${menu.label} link`);
    closeMenu();
  };

  const handleTogglePin = () => {
    try {
      const raw = window.localStorage.getItem('nexora-pinned-spaces');
      let pins: string[] = ['/connect', '/think', '/build'];
      if (raw) {
        pins = JSON.parse(raw);
      }
      const isPinned = pins.includes(menu.href);
      const updated = isPinned ? pins.filter(p => p !== menu.href) : [...pins, menu.href];
      window.localStorage.setItem('nexora-pinned-spaces', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('nexora-pins-change'));
      copyTextWithFeedback(isPinned ? `Unpinned ${menu.label}` : `Pinned ${menu.label} to sidebar`, 'Action');
    } catch {}
    closeMenu();
  };

  const menuItems = [
    { label: `Open ${menu.label}`, action: handleOpen, icon: '↗' },
    { label: `Focus on ${menu.label}`, action: handleFocusOnSpace, icon: '⏣' },
    { label: 'Toggle Pin in Sidebar', action: handleTogglePin, icon: '★' },
    { label: 'Copy Link', action: handleCopyLink, icon: '⎘' },
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={`${menu.label} actions`}
      style={{
        left: `${menu.x}px`,
        top: `${menu.y}px`,
      }}
    >
      <div className="context-menu-header" role="presentation">
        <span>{menu.label}</span>
      </div>

      {menuItems.map((item, idx) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`context-menu-item${idx === activeIndex ? ' is-active' : ''}`}
          onClick={item.action}
          onMouseEnter={() => setActiveIndex(idx)}
        >
          <span className="context-menu-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
