'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

type AuthMode = 'login' | 'signup' | 'recovery' | 'reset';

const modeCopy: Record<AuthMode, { title: string; description: string; button: string; endpoint: string }> = {
  login: { title: 'Welcome back.', description: 'Sign in to your private NEXORA workspace.', button: 'Sign in', endpoint: '/api/auth/login' },
  signup: { title: 'Make it yours.', description: 'Create an account to open your private workspace.', button: 'Create account', endpoint: '/api/auth/signup' },
  recovery: { title: 'Find your way back.', description: 'Enter the email address linked to your account.', button: 'Send recovery email', endpoint: '/api/auth/recovery' },
  reset: { title: 'Choose a new password.', description: 'Use at least 12 characters. Recovery links expire after 30 minutes.', button: 'Update password', endpoint: '/api/auth/reset-password' },
};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const copy = modeCopy[mode];
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setError('');

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    if (mode === 'reset') payload.token = new URLSearchParams(window.location.search).get('token') ?? '';

    try {
      const response = await fetch(copy.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'Please try again.');

      if (mode === 'login' || mode === 'signup') {
        const next = new URLSearchParams(window.location.search).get('next');
        let destination = '/workspace';
        if (next?.startsWith('/')) {
          try {
            const candidate = new URL(next, window.location.origin);
            if (candidate.origin === window.location.origin) {
              destination = `${candidate.pathname}${candidate.search}${candidate.hash}`;
            }
          } catch {
            destination = '/workspace';
          }
        }
        window.location.assign(destination);
        return;
      }

      setMessage(result.message ?? 'Your request is complete.');
      if (mode === 'reset') window.history.replaceState(null, '', '/reset-password');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be completed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="auth-eyebrow">YOUR NEXORA ACCOUNT</p>
      <h1 id="auth-title">{copy.title}</h1>
      <p className="auth-description">{copy.description}</p>

      <form className="auth-form" onSubmit={submit}>
        {mode === 'signup' && (
          <label className="auth-field">
            <span>Your name</span>
            <input name="fullName" type="text" autoComplete="name" minLength={2} maxLength={80} required />
          </label>
        )}
        {mode !== 'reset' && (
          <label className="auth-field">
            <span>Email address</span>
            <input name="email" type="email" autoComplete="email" maxLength={254} required />
          </label>
        )}
        {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
          <label className="auth-field">
            <span>{mode === 'login' ? 'Password' : 'New password'}</span>
            <input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 12} maxLength={128} required />
          </label>
        )}
        {(mode === 'signup' || mode === 'reset') && (
          <label className="auth-field">
            <span>Confirm password</span>
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
          </label>
        )}

        {error && <p className="auth-message auth-message-error" role="alert">{error}</p>}
        {message && <p className="auth-message auth-message-success" role="status">{message}</p>}
        <button className="button button-primary auth-submit" type="submit" disabled={pending}>
          {pending ? 'Please wait…' : copy.button}
          {!pending && <span aria-hidden="true">→</span>}
        </button>
      </form>

      <div className="auth-links">
        {mode === 'login' && <><Link href="/signup">Create an account</Link><Link href="/forgot-password">Forgot password?</Link></>}
        {mode === 'signup' && <Link href="/login">Already have an account? Sign in</Link>}
        {mode === 'recovery' && <Link href="/login">Back to sign in</Link>}
        {mode === 'reset' && <Link href="/login">Back to sign in</Link>}
      </div>
    </section>
  );
}
