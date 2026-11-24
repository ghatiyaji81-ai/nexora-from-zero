import type { Metadata, Viewport } from 'next';
import './globals.css';
import './create.css';
import './build.css';
import './discover.css';
import './social/social.css';
import { PwaController } from '@/components/pwa-controller';

export const metadata: Metadata = {
  title: {
    default: 'NEXORA — Your digital workspace',
    template: '%s · NEXORA',
  },
  description: 'A new, connected workspace for focused work, communication, and creative tools.',
  applicationName: 'NEXORA',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NEXORA',
  },
  icons: {
    icon: '/nexora-mark.svg',
    shortcut: '/favicon.ico',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#f4f3ed',
  width: 'device-width',
  initialScale: 1,
};

const appearanceInitScript = `
  try {
    const params = new URLSearchParams(window.location.search);
    const paramTheme = params.get('theme');
    const t = (paramTheme === 'light' || paramTheme === 'dark' || paramTheme === 'warm')
      ? paramTheme
      : localStorage.getItem('nexora-theme');
    if (t && (t === 'light' || t === 'dark' || t === 'warm')) document.documentElement.dataset.theme = t;
    const a = params.get('accent') || localStorage.getItem('nexora-accent');
    if (a) document.documentElement.dataset.accent = a;
    const d = params.get('density') || localStorage.getItem('nexora-density');
    if (d) document.documentElement.dataset.density = d;
    const font = params.get('font') || localStorage.getItem('nexora-font-mode');
    if (font) document.documentElement.dataset.fontMode = font;
    const loc = params.get('locale') || localStorage.getItem('nexora_locale') || 'en';
    if (loc === 'hi') {
      document.documentElement.lang = 'hi';
      document.documentElement.dataset.locale = 'hi';
    }
  } catch (e) {}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceInitScript }} />
      </head>
      <body>
        <PwaController />
        {children}
      </body>
    </html>
  );
}
