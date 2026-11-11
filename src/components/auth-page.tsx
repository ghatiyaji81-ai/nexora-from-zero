import Link from 'next/link';
import { ReactNode } from 'react';

export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-page-topline">
        <Link className="auth-brand" href="/" aria-label="NEXORA home"><span aria-hidden="true">N</span>NEXORA</Link>
        <Link className="auth-home-link" href="/">Back to home</Link>
      </div>
      <div className="auth-content">{children}</div>
      <footer className="auth-page-footer">A calmer place to think, make, and get things done.</footer>
    </main>
  );
}
