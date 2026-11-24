'use client';

import { useEffect, useRef, useState } from 'react';
import { setUserExplicitThemeOverride } from '@/lib/spaces-manager';
import { getLocale, setLocale, type SupportedLocale } from '@/lib/i18n-strings';

export type Theme = 'light' | 'warm' | 'dark';
export type Accent = 'lime' | 'iris' | 'cyan' | 'amber' | 'rose';
export type Density = 'comfortable' | 'compact';
export type TextSize = 'default' | 'large' | 'xlarge';
export type FontMode = 'standard' | 'dyslexic';
export type MotionMode = 'system' | 'reduce' | 'full';

const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: 'lime', label: 'Lime (Signature)', color: '#d6f26a' },
  { id: 'iris', label: 'Iris', color: '#a78bfa' },
  { id: 'cyan', label: 'Cyan', color: '#38bdf8' },
  { id: 'amber', label: 'Amber', color: '#fbbf24' },
  { id: 'rose', label: 'Rose', color: '#fb7185' },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [accent, setAccent] = useState<Accent>('lime');
  const [density, setDensity] = useState<Density>('comfortable');
  const [textSize, setTextSize] = useState<TextSize>('default');
  const [fontMode, setFontMode] = useState<FontMode>('standard');
  const [motionMode, setMotionMode] = useState<MotionMode>('system');
  const [locale, setLocaleState] = useState<SupportedLocale>('en');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocaleState(getLocale());
    // Restore saved preferences or URL overrides
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const paramTheme = params?.get('theme') as Theme | null;
    const savedTheme = (paramTheme && (paramTheme === 'light' || paramTheme === 'dark' || paramTheme === 'warm'))
      ? paramTheme
      : window.localStorage.getItem('nexora-theme') as Theme | null;
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'warm')) {
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
    }

    const savedAccent = window.localStorage.getItem('nexora-accent') as Accent | null;
    if (savedAccent && ACCENTS.some(a => a.id === savedAccent)) {
      setAccent(savedAccent);
      document.documentElement.dataset.accent = savedAccent;
    }

    const savedDensity = window.localStorage.getItem('nexora-density') as Density | null;
    if (savedDensity && (savedDensity === 'comfortable' || savedDensity === 'compact')) {
      setDensity(savedDensity);
      document.documentElement.dataset.density = savedDensity;
    }

    const savedTextSize = window.localStorage.getItem('nexora-text-size') as TextSize | null;
    if (savedTextSize && (savedTextSize === 'default' || savedTextSize === 'large' || savedTextSize === 'xlarge')) {
      setTextSize(savedTextSize);
      document.documentElement.dataset.textSize = savedTextSize;
    }

    const savedFontMode = window.localStorage.getItem('nexora-font-mode') as FontMode | null;
    if (savedFontMode && (savedFontMode === 'standard' || savedFontMode === 'dyslexic')) {
      setFontMode(savedFontMode);
      document.documentElement.dataset.fontMode = savedFontMode;
    }

    const savedMotionMode = window.localStorage.getItem('nexora-motion-mode') as MotionMode | null;
    if (savedMotionMode && (savedMotionMode === 'system' || savedMotionMode === 'reduce' || savedMotionMode === 'full')) {
      setMotionMode(savedMotionMode);
      document.documentElement.dataset.motionMode = savedMotionMode;
    }
  }, []);

  // Handle outside click and escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function changeTheme(nextTheme: Theme) {
    if (typeof document !== 'undefined') {
      const doc = document as Document & { startViewTransition?: (callback: () => void) => void };
      if (typeof doc.startViewTransition === 'function') {
        doc.startViewTransition(() => {
          setTheme(nextTheme);
          document.documentElement.dataset.theme = nextTheme;
        });
      } else {
        setTheme(nextTheme);
        document.documentElement.dataset.theme = nextTheme;
      }
    } else {
      setTheme(nextTheme);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('nexora-theme', nextTheme);
      setUserExplicitThemeOverride(true);
    }
  }

  function changeAccent(nextAccent: Accent) {
    setAccent(nextAccent);
    document.documentElement.dataset.accent = nextAccent;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('nexora-accent', nextAccent);
      setUserExplicitThemeOverride(true);
    }
  }

  function changeDensity(nextDensity: Density) {
    setDensity(nextDensity);
    document.documentElement.dataset.density = nextDensity;
    window.localStorage.setItem('nexora-density', nextDensity);
  }

  function changeTextSize(nextSize: TextSize) {
    setTextSize(nextSize);
    document.documentElement.dataset.textSize = nextSize;
    window.localStorage.setItem('nexora-text-size', nextSize);
  }

  function changeFontMode(nextMode: FontMode) {
    setFontMode(nextMode);
    document.documentElement.dataset.fontMode = nextMode;
    window.localStorage.setItem('nexora-font-mode', nextMode);
  }

  function changeMotionMode(nextMotion: MotionMode) {
    setMotionMode(nextMotion);
    document.documentElement.dataset.motionMode = nextMotion;
    window.localStorage.setItem('nexora-motion-mode', nextMotion);
  }

  function changeLocale(nextLocale: SupportedLocale) {
    setLocale(nextLocale);
    setLocaleState(nextLocale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLocale;
      document.documentElement.dataset.locale = nextLocale;
    }
  }

  return (
    <div className="appearance-container" ref={containerRef}>
      <button
        className="icon-button theme-toggle appearance-trigger"
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-label={`Appearance & accessibility settings: ${theme} theme, ${accent} accent, ${density} density, ${textSize} text, ${fontMode} font`}
        title={`Appearance & Accessibility (${theme} theme, ${textSize} text)`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {theme === 'light' ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.7" />
            <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
          </svg>
        ) : theme === 'warm' ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10m-10 4h10m-10 4h6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.3 15.1A8.6 8.6 0 0 1 8.9 3.7 8.8 8.8 0 1 0 20.3 15.1Z" />
          </svg>
        )}
        <span
          className="appearance-accent-dot"
          style={{ backgroundColor: ACCENTS.find(a => a.id === accent)?.color }}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className="appearance-popover"
          role="dialog"
          aria-label="Workspace appearance and accessibility settings"
        >
          <div className="appearance-header">
            <p className="appearance-title">Appearance & Accessibility</p>
            <span className="appearance-badge">WCAG AA</span>
          </div>

          {/* Theme Section */}
          <div className="appearance-section">
            <div className="appearance-label">
              <span>Theme</span>
              <small className="appearance-current">{theme.toUpperCase()}</small>
            </div>
            <div className="appearance-segmented" role="radiogroup" aria-label="Theme mode">
              <button
                type="button"
                className={`appearance-segment ${theme === 'light' ? 'is-active' : ''}`}
                onClick={() => changeTheme('light')}
                role="radio"
                aria-checked={theme === 'light'}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
                  <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
                Light
              </button>
              <button
                type="button"
                className={`appearance-segment ${theme === 'warm' ? 'is-active' : ''}`}
                onClick={() => changeTheme('warm')}
                role="radio"
                aria-checked={theme === 'warm'}
                title="Eye-Comfort sepia tones for reduced strain"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M6 6h8m-8 4h8" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
                Warm
              </button>
              <button
                type="button"
                className={`appearance-segment ${theme === 'dark' ? 'is-active' : ''}`}
                onClick={() => changeTheme('dark')}
                role="radio"
                aria-checked={theme === 'dark'}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
                Dark
              </button>
            </div>
          </div>

          {/* Language Selection: English vs Hindi */}
          <div className="appearance-section">
            <div className="appearance-label">
              <span>Language (भाषा)</span>
              <small className="appearance-current">{locale === 'hi' ? 'हिन्दी' : 'ENGLISH'}</small>
            </div>
            <div className="appearance-segmented" role="radiogroup" aria-label="Language selection">
              <button
                type="button"
                className={`appearance-segment ${locale === 'en' ? 'is-active' : ''}`}
                onClick={() => changeLocale('en')}
                role="radio"
                aria-checked={locale === 'en'}
              >
                English
              </button>
              <button
                type="button"
                className={`appearance-segment ${locale === 'hi' ? 'is-active' : ''}`}
                onClick={() => changeLocale('hi')}
                role="radio"
                aria-checked={locale === 'hi'}
              >
                हिन्दी
              </button>
            </div>
            {locale === 'hi' && fontMode === 'dyslexic' && (
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--muted, #6b7264)',
                  lineHeight: 1.4,
                  padding: '0.4rem 0.6rem',
                  borderRadius: '0.375rem',
                  background: 'rgba(107, 114, 100, 0.08)',
                }}
              >
                <strong>Font Note:</strong> OpenDyslexic contains Latin glyphs only. In Hindi mode, a legible Devanagari font (Noto Sans Devanagari) is explicitly used.
              </div>
            )}
          </div>

          {/* Accent Color */}
          <div className="appearance-section">
            <div className="appearance-label">
              <span>Accent Color</span>
              <small className="appearance-current">
                {ACCENTS.find(a => a.id === accent)?.label.split(' ')[0]}
              </small>
            </div>
            <div className="appearance-swatches" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`appearance-swatch ${accent === item.id ? 'is-selected' : ''}`}
                  style={{ backgroundColor: item.color }}
                  onClick={() => changeAccent(item.id)}
                  role="radio"
                  aria-checked={accent === item.id}
                  aria-label={`${item.label} accent color`}
                  title={item.label}
                >
                  {accent === item.id && (
                    <span className="appearance-swatch-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Text Size (Adjustable rem units) */}
          <div className="appearance-section">
            <div className="appearance-label">
              <span>Text Size</span>
              <small className="appearance-current">
                {textSize === 'default' ? '100%' : textSize === 'large' ? '112%' : '125%'}
              </small>
            </div>
            <div className="appearance-segmented" role="radiogroup" aria-label="Adjustable text size">
              <button
                type="button"
                className={`appearance-segment ${textSize === 'default' ? 'is-active' : ''}`}
                onClick={() => changeTextSize('default')}
                role="radio"
                aria-checked={textSize === 'default'}
              >
                Default
              </button>
              <button
                type="button"
                className={`appearance-segment ${textSize === 'large' ? 'is-active' : ''}`}
                onClick={() => changeTextSize('large')}
                role="radio"
                aria-checked={textSize === 'large'}
              >
                Large
              </button>
              <button
                type="button"
                className={`appearance-segment ${textSize === 'xlarge' ? 'is-active' : ''}`}
                onClick={() => changeTextSize('xlarge')}
                role="radio"
                aria-checked={textSize === 'xlarge'}
              >
                Extra Large
              </button>
            </div>
          </div>

          {/* Reading Font: Standard vs Dyslexia-Friendly */}
          <div className="appearance-section">
            <div className="appearance-label">
              <span>Typography</span>
              <small className="appearance-current">
                {fontMode === 'dyslexic' ? 'DYSLEXIC' : 'STANDARD'}
              </small>
            </div>
            <div className="appearance-segmented" role="radiogroup" aria-label="Reading typography mode">
              <button
                type="button"
                className={`appearance-segment ${fontMode === 'standard' ? 'is-active' : ''}`}
                onClick={() => changeFontMode('standard')}
                role="radio"
                aria-checked={fontMode === 'standard'}
              >
                Standard
              </button>
              <button
                type="button"
                className={`appearance-segment ${fontMode === 'dyslexic' ? 'is-active' : ''}`}
                onClick={() => changeFontMode('dyslexic')}
                role="radio"
                aria-checked={fontMode === 'dyslexic'}
                title="Enhanced legibility typography with wider tracking and weighted bottoms"
              >
                Dyslexia-Friendly
              </button>
            </div>
          </div>

          {/* Reduced Motion Toggle (Overrides OS Setting) */}
          <div className="appearance-section">
            <div className="appearance-label">
              <span>Motion System</span>
              <small className="appearance-current">{motionMode.toUpperCase()}</small>
            </div>
            <div className="appearance-segmented" role="radiogroup" aria-label="Animation motion preference">
              <button
                type="button"
                className={`appearance-segment ${motionMode === 'system' ? 'is-active' : ''}`}
                onClick={() => changeMotionMode('system')}
                role="radio"
                aria-checked={motionMode === 'system'}
                title="Follow operating system reduced motion setting"
              >
                System
              </button>
              <button
                type="button"
                className={`appearance-segment ${motionMode === 'reduce' ? 'is-active' : ''}`}
                onClick={() => changeMotionMode('reduce')}
                role="radio"
                aria-checked={motionMode === 'reduce'}
                title="Disable transitions and animated timers"
              >
                Reduced
              </button>
              <button
                type="button"
                className={`appearance-segment ${motionMode === 'full' ? 'is-active' : ''}`}
                onClick={() => changeMotionMode('full')}
                role="radio"
                aria-checked={motionMode === 'full'}
                title="Enable smooth 60fps animations"
              >
                Full
              </button>
            </div>
          </div>

          {/* Density */}
          <div className="appearance-section">
            <div className="appearance-label">
              <span>Density</span>
              <small className="appearance-current">{density.toUpperCase()}</small>
            </div>
            <div className="appearance-segmented" role="radiogroup" aria-label="Interface density">
              <button
                type="button"
                className={`appearance-segment ${density === 'comfortable' ? 'is-active' : ''}`}
                onClick={() => changeDensity('comfortable')}
                role="radio"
                aria-checked={density === 'comfortable'}
              >
                Comfortable
              </button>
              <button
                type="button"
                className={`appearance-segment ${density === 'compact' ? 'is-active' : ''}`}
                onClick={() => changeDensity('compact')}
                role="radio"
                aria-checked={density === 'compact'}
              >
                Compact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
