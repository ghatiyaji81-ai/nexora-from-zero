import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'NEXORA — Your digital workspace',
    template: '%s · NEXORA',
  },
  description: 'A new, connected workspace for focused work, communication, and creative tools.',
  applicationName: 'NEXORA',
};

export const viewport: Viewport = {
  themeColor: '#f4f3ed',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
