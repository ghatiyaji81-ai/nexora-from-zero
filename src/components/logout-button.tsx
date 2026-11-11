'use client';

import { useState } from 'react';

export function LogoutButton() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? 'Sign out could not be confirmed.');
      }
      window.location.assign('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign out could not be confirmed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="logout-control">
      <button className="button button-quiet" type="button" onClick={logout} disabled={pending}>
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {error && <p className="auth-message auth-message-error" role="alert">{error}</p>}
    </div>
  );
}
