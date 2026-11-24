'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { PreviewLink } from '@/components/preview-link';
import { CommandPalette } from '@/components/command-palette';
import { ShortcutModal } from '@/components/shortcut-modal';
import { DistractionShield } from '@/components/distraction-shield';
import { ToastContainer } from '@/components/toast-container';
import { ContextMenu } from '@/components/context-menu';
import { OnboardingWizard } from '@/components/onboarding-wizard';
import { SpaceSwitcher } from '@/components/space-switcher';
import { MobileNav } from '@/components/mobile-nav';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { getShortcutsConfig, matchesCombo } from '@/lib/shortcut-config';
import { getWorkspaceStatus } from '@/lib/workspace-status';
import {
  FocusSessionState,
  formatFocusTime,
  getFocusState,
  initFocusManager,
  isSpaceAllowed,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  stopFocusSession,
  toggleDistractionShield,
} from '@/lib/focus-manager';

type AppShellProps = { children: ReactNode };

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 30 30">
        <path d="M6 23V7l18 16V7" />
        <path d="M6 7h5M19 23h5" />
      </svg>
    </span>
  );
}

interface NavItemConfig {
  href: string;
  label: string;
  icon: React.ReactNode;
  arrow?: boolean;
  previewVariant: string;
  actionLabel: string;
  actionHref: string;
  onAction?: () => void;
  description: string;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [gSequence, setGSequence] = useState(false);
  const sequenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Focus Session & Distraction Shield state
  const [focusState, setFocusState] = useState<FocusSessionState>(() => getFocusState());

  // Pinned and Recent spaces state
  const [pinnedRoutes, setPinnedRoutes] = useState<string[]>(['/connect', '/think', '/build']);
  const [recentRoutes, setRecentRoutes] = useState<string[]>([]);

  // Initialize focus manager and listen to updates
  useEffect(() => {
    const initial = initFocusManager();
    setFocusState(initial);

    function handleFocusChange(e: Event) {
      const customEvent = e as CustomEvent<FocusSessionState>;
      if (customEvent.detail) {
        setFocusState(customEvent.detail);
      } else {
        setFocusState(getFocusState());
      }
    }

    const handleOpenPalette = () => setPaletteOpen(true);
    window.addEventListener('nexora-open-palette', handleOpenPalette);
    window.addEventListener('nexora-focus-change', handleFocusChange);
    return () => {
      window.removeEventListener('nexora-focus-change', handleFocusChange);
      window.removeEventListener('nexora-open-palette', handleOpenPalette);
    };
  }, []);

  // Load pinned and recents from localStorage
  useEffect(() => {
    function loadSavedPins() {
      try {
        const savedPinned = window.localStorage.getItem('nexora-pinned-spaces');
        if (savedPinned) {
          const parsed = JSON.parse(savedPinned);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPinnedRoutes(parsed);
          }
        }
      } catch {}
    }

    loadSavedPins();
    window.addEventListener('nexora-pins-change', loadSavedPins);

    try {
      const savedRecents = window.localStorage.getItem('nexora-recent-spaces');
      if (savedRecents) {
        const parsed = JSON.parse(savedRecents);
        if (Array.isArray(parsed)) {
          setRecentRoutes(parsed);
        }
      }
    } catch {}

    return () => window.removeEventListener('nexora-pins-change', loadSavedPins);
  }, []);

  // Update recents on navigation
  useEffect(() => {
    if (!pathname || pathname === '/') return;
    try {
      setRecentRoutes(prev => {
        const updated = [pathname, ...prev.filter(r => r !== pathname)].slice(0, 3);
        window.localStorage.setItem('nexora-recent-spaces', JSON.stringify(updated));
        return updated;
      });
    } catch {}
  }, [pathname]);

  const togglePin = (href: string) => {
    setPinnedRoutes(prev => {
      const next = prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href];
      try {
        window.localStorage.setItem('nexora-pinned-spaces', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Base navigation definition
  const NAV_ITEMS: NavItemConfig[] = useMemo(
    () => [
      {
        href: '/',
        label: 'Overview',
        icon: <path d="M4 10.5 12 4l8 6.5V20h-6v-5h-4v5H4z" />,
        previewVariant: 'overview',
        actionLabel: 'Open Focus',
        actionHref: '/#focus',
        description: 'Unified dashboard with focus room, product map, and workspace status.',
      },
      {
        href: '/#focus',
        label: 'Focus room',
        icon: (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3m10 7h-3M5 12H2m10 10v-3" />
          </>
        ),
        arrow: true,
        previewVariant: 'focus',
        actionLabel: 'Start 25m',
        actionHref: '/#focus',
        onAction: () => {
          if (typeof window !== 'undefined' && window.location.pathname === '/') {
            startFocusSession('/#focus', 25 * 60);
            window.dispatchEvent(new CustomEvent('nexora-start-focus'));
          } else {
            router.push('/#focus-start');
            setTimeout(() => {
              startFocusSession('/#focus', 25 * 60);
              window.dispatchEvent(new CustomEvent('nexora-start-focus'));
            }, 150);
          }
        },
        description: 'Quiet 25-minute attention session with local offline progress.',
      },
      {
        href: '/connect',
        label: 'Connect',
        icon: (
          <>
            <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.2-.7L4 20l1.7-4.1A7.5 7.5 0 1 1 20 11.5Z" />
            <path d="M8 11h8m-8 3h5" />
          </>
        ),
        arrow: true,
        previewVariant: 'connect',
        actionLabel: 'Open Connect',
        actionHref: '/connect',
        description: 'Direct messaging, group channels, and secure media exchange.',
      },
      {
        href: '/think',
        label: 'Think',
        icon: (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M8 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1 2.1-2.5 2.5v2m0 2.5v.1" />
          </>
        ),
        arrow: true,
        previewVariant: 'think',
        actionLabel: 'Open Think',
        actionHref: '/think',
        description: 'Multi-model intelligence workspace for thinking through ideas and documents.',
      },
      {
        href: '/speak',
        label: 'Speak',
        icon: (
          <>
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" />
          </>
        ),
        arrow: true,
        previewVariant: 'speak',
        actionLabel: 'Open Speak',
        actionHref: '/speak',
        description: 'Browser-native voice interaction connected to private THINK conversations.',
      },
      {
        href: '/create',
        label: 'Create',
        icon: (
          <>
            <path d="M4 5h16v14H4z" />
            <path d="M8 15 11 11l2 2 3-4 3 6M8 8h.1" />
          </>
        ),
        arrow: true,
        previewVariant: 'create',
        actionLabel: 'Open Create',
        actionHref: '/create',
        description: 'Visual design canvas, document drafting, and asset editing studio.',
      },
      {
        href: '/build',
        label: 'Build',
        icon: (
          <>
            <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-2-14-4 18" />
          </>
        ),
        arrow: true,
        previewVariant: 'build',
        actionLabel: 'Open Build',
        actionHref: '/build',
        description: 'Private code workspace with file tree, local preview, and offline safety.',
      },
      {
        href: '/discover',
        label: 'Discover',
        icon: (
          <>
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 5 5M8 10.5h5m-2.5-2.5v5" />
          </>
        ),
        arrow: true,
        previewVariant: 'discover',
        actionLabel: 'Open Discover',
        actionHref: '/discover',
        description: 'Private search engine and source-backed research reports with traceable citations.',
      },
      {
        href: '/social',
        label: 'Social',
        icon: (
          <>
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0m1-4a4.5 4.5 0 0 1 5 4" />
          </>
        ),
        arrow: true,
        previewVariant: 'social',
        actionLabel: 'Open Social',
        actionHref: '/social',
        description: 'Privacy-aware activity feed, expiring stories, and follow controls.',
      },
    ],
    [router]
  );

  // Global Keyboard Shortcuts (G then ..., ?, Cmd+K, Alt+F, Esc)
  useEffect(() => {
    function isEditableTarget(el: EventTarget | null): boolean {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        el.isContentEditable ||
        el.getAttribute('role') === 'textbox'
      );
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;

      // Cmd/Ctrl + K -> Command Palette
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // Remappable Shortcuts: Focus Mode and Dyslexic Font
      const shortcuts = getShortcutsConfig();

      if (matchesCombo(event, shortcuts.focusToggle)) {
        event.preventDefault();
        const current = getFocusState();
        if (current.isActive) {
          stopFocusSession();
        } else {
          startFocusSession(pathname || '/', 25 * 60);
        }
        return;
      }

      if (matchesCombo(event, shortcuts.dyslexicToggle)) {
        event.preventDefault();
        const currentMode = document.documentElement.dataset.fontMode;
        const nextMode = currentMode === 'dyslexic' ? 'standard' : 'dyslexic';
        document.documentElement.dataset.fontMode = nextMode;
        window.localStorage.setItem('nexora-font-mode', nextMode);
        window.dispatchEvent(new CustomEvent('nexora-appearance-change', { detail: { fontMode: nextMode } }));
        return;
      }

      // ? -> Shortcuts Cheat Sheet
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setShortcutModalOpen(true);
        return;
      }

      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setShortcutModalOpen(false);
        setGSequence(false);
        return;
      }

      // Two-key sequence ("G then ...")
      if (gSequence) {
        const key = event.key.toLowerCase();
        let targetHref: string | null = null;
        let startFocus = false;

        if (key === 'h' || key === 'o') targetHref = '/';
        else if (key === 'f') {
          targetHref = '/#focus';
          startFocus = true;
        } else if (key === 'c') targetHref = '/connect';
        else if (key === 't') targetHref = '/think';
        else if (key === 's') targetHref = '/speak';
        else if (key === 'r') targetHref = '/create';
        else if (key === 'b') targetHref = '/build';
        else if (key === 'd') targetHref = '/discover';
        else if (key === 'a') targetHref = '/social';
        else if (key === 'p') {
          event.preventDefault();
          setGSequence(false);
          window.dispatchEvent(new CustomEvent('nexora-open-space-switcher'));
          return;
        }

        if (targetHref) {
          event.preventDefault();
          setGSequence(false);
          router.push(targetHref);
          if (startFocus) {
            setTimeout(() => {
              startFocusSession('/#focus', 25 * 60);
              window.dispatchEvent(new CustomEvent('nexora-start-focus'));
            }, 100);
          }
          return;
        }

        // Any other key cancels sequence
        setGSequence(false);
        return;
      }

      // Start "G" sequence
      if (event.key.toLowerCase() === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        setGSequence(true);
        if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
        sequenceTimerRef.current = setTimeout(() => {
          setGSequence(false);
        }, 1500);
      }
    }

    const handleOpenShortcuts = () => setShortcutModalOpen(true);
    window.addEventListener('nexora-open-shortcuts', handleOpenShortcuts);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('nexora-open-shortcuts', handleOpenShortcuts);
      if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
    };
  }, [gSequence, pathname, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Derive pinned and recent items from nav config
  const pinnedItems = useMemo(() => {
    return NAV_ITEMS.filter(item => pinnedRoutes.includes(item.href));
  }, [NAV_ITEMS, pinnedRoutes]);

  const recentItems = useMemo(() => {
    return recentRoutes
      .map(r => NAV_ITEMS.find(item => item.href === r))
      .filter((item): item is NavItemConfig => Boolean(item));
  }, [NAV_ITEMS, recentRoutes]);

  // Determine whether current path is shielded by Distraction Shield
  const isShieldBlocked =
    focusState.isActive &&
    focusState.distractionShieldEnabled &&
    !isSpaceAllowed(pathname, focusState);

  return (
    <div className={`app-frame${focusState.isActive ? ' focus-mode-active' : ''}`}>
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <aside className={`sidebar${mobileNavOpen ? ' sidebar-open' : ''}`} aria-label="Workspace navigation">
        <Link className="brand-lockup" href="/" aria-label="NEXORA home">
          <BrandMark />
          <span className="brand-wordmark">
            NEXORA<span>®</span>
          </span>
        </Link>

        {/* Profile / Space Switcher (Item 4) */}
        <SpaceSwitcher />

        {/* Primary Navigation */}
        <div className="nav-group-label">
          {focusState.isActive ? 'WORKSPACES (FOCUS MODE)' : 'YOUR WORKSPACE'}
        </div>
        <nav className="primary-nav" aria-label="Workspaces">
          {NAV_ITEMS.map(item => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const isPinned = pinnedRoutes.includes(item.href);
            const isShielded =
              focusState.isActive &&
              focusState.distractionShieldEnabled &&
              !isSpaceAllowed(item.href, focusState);
            const isFocusTarget =
              focusState.isActive &&
              (focusState.chosenSpace === item.href ||
                (item.href === '/#focus' && focusState.chosenSpace.includes('focus')));

            return (
              <div
                key={item.href}
                className={`sidebar-item-row${isShielded ? ' is-shielded' : ''}${
                  isFocusTarget ? ' is-focus-target' : ''
                }`}
              >
                <PreviewLink
                  className={`nav-link${isActive ? ' nav-link-active' : ''}`}
                  href={item.href}
                  placement="right"
                  preview={{
                    title: item.label,
                    description: item.description,
                    status: isShielded ? 'Shielded · Focus active' : getWorkspaceStatus(item.previewVariant).statusText,
                    actionLabel: item.actionLabel,
                    actionHref: item.actionHref,
                    onAction: item.onAction,
                    variant: item.previewVariant,
                  }}
                >
                  {isActive && <span className="nav-link-active-pill" />}
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {item.icon}
                  </svg>
                  <span>{item.label}</span>
                  {isShielded ? (
                    <span className="shield-mini-indicator" title="Shielded during focus session" aria-label="Shielded">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </span>
                  ) : item.arrow ? (
                    <span className="nav-link-arrow" aria-hidden="true">
                      ↗
                    </span>
                  ) : null}
                </PreviewLink>
                {item.href !== '/' && (
                  <button
                    type="button"
                    className={`sidebar-pin-btn ${isPinned ? 'is-pinned' : ''}`}
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePin(item.href);
                    }}
                    title={isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
                    aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${item.label}`}
                  >
                    ★
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        {/* Pinned Section */}
        {pinnedItems.length > 0 && (
          <div className={`sidebar-section${focusState.isActive ? ' focus-dimmed' : ''}`}>
            <div className="nav-group-label sidebar-section-header">
              <span>PINNED</span>
              <span className="sidebar-badge">{pinnedItems.length}</span>
            </div>
            <nav className="primary-nav secondary-nav" aria-label="Pinned workspaces">
              {pinnedItems.map(item => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <div key={`pin-${item.href}`} className="sidebar-item-row">
                    <PreviewLink
                      className={`nav-link nav-link-subtle${isActive ? ' nav-link-active' : ''}`}
                      href={item.href}
                      placement="right"
                      preview={{
                        title: item.label,
                        description: item.description,
                        status: getWorkspaceStatus(item.previewVariant).statusText,
                        actionLabel: item.actionLabel,
                        actionHref: item.actionHref,
                        onAction: item.onAction,
                        variant: item.previewVariant,
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        {item.icon}
                      </svg>
                      <span>{item.label}</span>
                      <span className="pinned-star" aria-hidden="true">
                        ★
                      </span>
                    </PreviewLink>
                    <button
                      type="button"
                      className="sidebar-pin-toggle"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePin(item.href);
                      }}
                      title="Unpin"
                      aria-label={`Unpin ${item.label}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </nav>
          </div>
        )}

        {/* Recent Section */}
        {recentItems.length > 0 && (
          <div className={`sidebar-section${focusState.isActive ? ' focus-dimmed' : ''}`}>
            <div className="nav-group-label sidebar-section-header">
              <span>RECENTS</span>
              <span className="sidebar-badge">{recentItems.length}</span>
            </div>
            <nav className="primary-nav secondary-nav" aria-label="Recent workspaces">
              {recentItems.map(item => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <div key={`rec-${item.href}`} className="sidebar-item-row">
                    <PreviewLink
                      className={`nav-link nav-link-subtle${isActive ? ' nav-link-active' : ''}`}
                      href={item.href}
                      placement="right"
                      preview={{
                        title: item.label,
                        description: item.description,
                        status: getWorkspaceStatus(item.previewVariant).statusText,
                        actionLabel: item.actionLabel,
                        actionHref: item.actionHref,
                        onAction: item.onAction,
                        variant: item.previewVariant,
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        {item.icon}
                      </svg>
                      <span>{item.label}</span>
                      <span className="recent-dot" aria-hidden="true" />
                    </PreviewLink>
                  </div>
                );
              })}
            </nav>
          </div>
        )}

        <div className="sidebar-spacer" />

        <div className="sidebar-note">
          <span className="note-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <p>
            <strong>Built with intention.</strong>
            <br />
            Every space earns its place.
          </p>
        </div>
        <div className="sidebar-bottom">
          <span className="sidebar-avatar" aria-hidden="true">
            NX
          </span>
          <Link className="sidebar-user" href="/login">
            <strong>Sign in or join</strong>
            <small>Open a private workspace</small>
          </Link>
          <span className="sidebar-presence" role="status" aria-label="Local preview" />
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button
            className="mobile-menu-button icon-button"
            type="button"
            onClick={() => setMobileNavOpen(value => !value)}
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {mobileNavOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
          <div className="breadcrumb">
            <span>Personal space</span>
            <span className="breadcrumb-slash">/</span>
            <strong>
              {pathname.startsWith('/connect')
                ? 'Connect'
                : pathname.startsWith('/think')
                ? 'Think'
                : pathname.startsWith('/speak')
                ? 'Speak'
                : pathname.startsWith('/create')
                ? 'Create'
                : pathname.startsWith('/build')
                ? 'Build'
                : pathname.startsWith('/discover')
                ? 'Discover'
                : pathname.startsWith('/social')
                ? 'Social'
                : 'Overview'}
            </strong>
          </div>
          <div className="topbar-actions">
            {/* Focus Bar or Focus Trigger */}
            {focusState.isActive ? (
              <div className="topbar-focus-bar" role="status" aria-label="Active focus session">
                <div className="topbar-focus-timer">
                  <span className={`topbar-focus-pulse${focusState.isPaused ? ' is-paused' : ''}`} />
                  <span>{formatFocusTime(focusState.remainingSeconds)}</span>
                </div>
                <span className="topbar-focus-space">{focusState.chosenSpaceLabel}</span>
                <button
                  type="button"
                  className={`topbar-focus-shield-toggle${focusState.distractionShieldEnabled ? ' is-active' : ''}`}
                  onClick={() => toggleDistractionShield()}
                  title={
                    focusState.distractionShieldEnabled
                      ? 'Distraction Shield active (click to disable)'
                      : 'Distraction Shield disabled (click to enable)'
                  }
                  aria-label="Toggle Distraction Shield"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>{focusState.distractionShieldEnabled ? 'Shield ON' : 'Shield OFF'}</span>
                </button>
                <span
                  className="topbar-focus-mute-indicator"
                  title="Focus mode actively holds sample notifications into daily digest; VIP contacts still alert"
                  aria-label="Focus mode actively holds sample notifications into daily digest; VIP contacts still alert"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                  <span className="mute-text-label">Digest active (sample)</span>
                </span>
                <button
                  type="button"
                  className="topbar-focus-btn"
                  onClick={() => (focusState.isPaused ? resumeFocusSession() : pauseFocusSession())}
                  title={focusState.isPaused ? 'Resume focus timer' : 'Pause focus timer'}
                  aria-label={focusState.isPaused ? 'Resume' : 'Pause'}
                >
                  {focusState.isPaused ? '▶' : 'Ⅱ'}
                </button>
                <button
                  type="button"
                  className="topbar-focus-btn btn-stop"
                  onClick={() => stopFocusSession()}
                  title="End focus session"
                  aria-label="End focus session"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="topbar-focus-trigger"
                onClick={() => startFocusSession(pathname, 25 * 60)}
                title="Start 25m Focus Session on this space (Alt + Shift + F)"
                aria-label="Start 25m Focus Session"
              >
                <span aria-hidden="true">⏣</span> Focus
              </button>
            )}

            <button className="search-trigger" type="button" onClick={() => setPaletteOpen(true)} aria-haspopup="dialog" aria-label="Search actions">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 5 5" />
              </svg>
              <span>Search actions</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button shortcut-trigger"
              type="button"
              onClick={() => setShortcutModalOpen(true)}
              aria-label="Keyboard shortcuts (press ?)"
              title="Keyboard shortcuts (?)"
            >
              <span className="shortcut-question-mark">?</span>
            </button>
            <span className="topbar-divider" />
            <ThemeToggle />
            <Link className="topbar-auth-link" href="/login">
              Sign in
            </Link>
            <span className="topbar-avatar" aria-label="NEXORA local preview">
              N
            </span>
          </div>
        </header>

        {isShieldBlocked ? (
          <DistractionShield pathname={pathname} focusState={focusState} />
        ) : (
          <main id="main-content" key={pathname} tabIndex={-1} className="content-container">
            <PullToRefresh>
              {children}
            </PullToRefresh>
          </main>
        )}
      </div>

      <MobileNav />

      {mobileNavOpen && (
        <button
          className="mobile-nav-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Floating Sequence Indicator Pill */}
      {gSequence && (
        <div className="sequence-indicator-pill" role="status" aria-live="polite">
          <span className="sequence-key">G</span> then…
          <span className="sequence-hints">H, F, C, T, S, R, B, D, A, P (Spaces)</span>
        </div>
      )}

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      <ShortcutModal isOpen={shortcutModalOpen} onClose={() => setShortcutModalOpen(false)} />
      <ToastContainer />
      <ContextMenu />
      <OnboardingWizard />
    </div>
  );
}
