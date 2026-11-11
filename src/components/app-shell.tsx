'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

type AppShellProps = { children: ReactNode };

const commands = [
  { label: 'Go to overview', detail: 'Your NEXORA home', href: '/' },
  { label: 'Open Connect', detail: 'Private messages and groups', href: '/connect' },
  { label: 'Open Think', detail: 'AI workspace and conversations', href: '/think' },
  { label: 'Open Speak', detail: 'Voice intelligence and recordings', href: '/speak' },
  { label: 'Open focus room', detail: 'Jump to the local focus timer', href: '/#focus' },
  { label: 'View product map', detail: 'See what is planned', href: '/#roadmap' },
  { label: 'Sign in', detail: 'Open your private workspace', href: '/login' },
];

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 30 30"><path d="M6 23V7l18 16V7" /><path d="M6 7h5M19 23h5" /></svg>
    </span>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return commands.filter(command => `${command.label} ${command.detail}`.toLowerCase().includes(normalized));
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function runCommand(href: string) {
    router.push(href);
    onClose();
  }

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="palette-title">
        <h2 className="sr-only" id="palette-title">Search workspace actions</h2>
        <label className="palette-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'Enter' && filteredCommands[0]) runCommand(filteredCommands[0].href);
            }}
            placeholder="Find a workspace action…"
            aria-label="Find a workspace action"
          />
          <kbd>ESC</kbd>
        </label>
        <p className="palette-section-label">AVAILABLE ACTIONS</p>
        <div className="palette-results">
          {filteredCommands.length > 0 ? filteredCommands.map((command, index) => (
            <button className="palette-result" type="button" key={command.href} onClick={() => runCommand(command.href)}>
              <span className="palette-result-icon" aria-hidden="true">{index === 1 ? '◉' : index === 2 ? '⌘' : index === 3 ? '◖' : '↗'}</span>
              <span><strong>{command.label}</strong><small>{command.detail}</small></span>
              <span className="palette-result-arrow" aria-hidden="true">↵</span>
            </button>
          )) : <p className="palette-empty">No available actions match “{query}”.</p>}
        </div>
        <div className="palette-footer"><span>Search only includes features that are available today.</span><span><kbd>CTRL</kbd> + <kbd>K</kbd></span></div>
      </section>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="app-frame">
      <aside className={`sidebar${mobileNavOpen ? ' sidebar-open' : ''}`} aria-label="Workspace navigation">
        <Link className="brand-lockup" href="/" aria-label="NEXORA home">
          <BrandMark />
          <span className="brand-wordmark">NEXORA<span>®</span></span>
        </Link>

        <div className="workspace-switcher">
          <span className="workspace-avatar">N</span>
          <span className="workspace-name"><strong>Personal space</strong><small>Local preview</small></span>
          <span className="workspace-caret" aria-hidden="true">⌄</span>
        </div>

        <div className="nav-group-label">YOUR WORKSPACE</div>
        <nav className="primary-nav">
          <Link className={`nav-link${pathname === '/' ? ' nav-link-active' : ''}`} href="/">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20h-6v-5h-4v5H4z" /></svg>
            <span>Overview</span>
            <span className="nav-link-indicator" />
          </Link>
          <Link className="nav-link" href="/#focus">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3m10 7h-3M5 12H2m10 10v-3" /></svg>
            <span>Focus room</span>
            <span className="nav-link-arrow" aria-hidden="true">↗</span>
          </Link>
          <Link className={`nav-link${pathname.startsWith('/connect') ? ' nav-link-active' : ''}`} href="/connect">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.2-.7L4 20l1.7-4.1A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11h8m-8 3h5" /></svg>
            <span>Connect</span>
            <span className="nav-link-arrow" aria-hidden="true">↗</span>
          </Link>
          <Link className={`nav-link${pathname.startsWith('/think') ? ' nav-link-active' : ''}`} href="/think">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M8 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1 2.1-2.5 2.5v2m0 2.5v.1" /></svg>
            <span>Think</span>
            <span className="nav-link-arrow" aria-hidden="true">↗</span>
          </Link>
          <Link className={`nav-link${pathname.startsWith('/speak') ? ' nav-link-active' : ''}`} href="/speak">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" /></svg>
            <span>Speak</span>
            <span className="nav-link-arrow" aria-hidden="true">↗</span>
          </Link>
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-note">
          <span className="note-orbit" aria-hidden="true"><i /><i /><i /></span>
          <p><strong>Built with intention.</strong><br />Every space earns its place.</p>
        </div>
        <div className="sidebar-bottom">
          <span className="sidebar-avatar" aria-hidden="true">NX</span>
          <Link className="sidebar-user" href="/login"><strong>Sign in or join</strong><small>Open a private workspace</small></Link>
          <span className="sidebar-presence" aria-label="Local preview" />
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" type="button" onClick={() => setMobileNavOpen(value => !value)} aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileNavOpen}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{mobileNavOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
          </button>
          <div className="breadcrumb"><span>Personal space</span><span className="breadcrumb-slash">/</span><strong>{pathname.startsWith('/connect') ? 'Connect' : pathname.startsWith('/think') ? 'Think' : pathname.startsWith('/speak') ? 'Speak' : 'Overview'}</strong></div>
          <div className="topbar-actions">
            <button className="search-trigger" type="button" onClick={() => setPaletteOpen(true)} aria-haspopup="dialog">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
              <span>Search actions</span><kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <ThemeToggle />
            <Link className="topbar-auth-link" href="/login">Sign in</Link>
            <span className="topbar-avatar" aria-label="NEXORA local preview">N</span>
          </div>
        </header>

        {children}
      </div>

      {mobileNavOpen && <button className="mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
