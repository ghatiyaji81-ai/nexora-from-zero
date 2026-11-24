'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { showToast, showUndoToast } from '@/lib/toast-manager';

function sanitizeText(raw: string | null, maxLen: number): string {
  if (!raw) return '';
  return raw
    .replace(/<[^>]*>?/gm, '') // strip HTML tags
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '') // strip control chars
    .trim()
    .slice(0, maxLen);
}

function sanitizeUrl(raw: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href.slice(0, 2048);
    }
  } catch {
    // invalid URL format
  }
  return '';
}

function ShareTargetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [userFullName, setUserFullName] = useState<string>('');

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Check authentication status
  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (res) => {
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setUserFullName(data?.user?.fullName || 'User');
          setAuthStatus('authenticated');
        } else {
          setAuthStatus('unauthenticated');
        }
      })
      .catch(() => {
        if (active) setAuthStatus('unauthenticated');
      });

    return () => {
      active = false;
    };
  }, []);

  // Parse and sanitize query parameters
  useEffect(() => {
    if (!searchParams) return;
    const rawTitle = searchParams.get('title');
    const rawText = searchParams.get('text');
    const rawUrl = searchParams.get('url');

    setTitle(sanitizeText(rawTitle, 200));
    setText(sanitizeText(rawText, 10000));
    setUrl(sanitizeUrl(rawUrl));
  }, [searchParams]);

  const handleSaveToThink = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const noteTitle = title.trim() || 'Shared Note';
      const fileContent = `${title ? `# ${title}\n\n` : ''}${text}${url ? `\n\nSource: ${url}` : ''}`;
      const blob = new Blob([fileContent], { type: 'text/plain' });
      const safeFilename = `${noteTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'shared-note'}.txt`;
      const file = new File([blob], safeFilename, { type: 'text/plain' });

      const form = new FormData();
      form.append('file', file);

      const res = await fetch('/api/think/documents', {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to save document to Think.');
      }

      const body = await res.json();
      const docId = body?.document?.id;

      setSavedSuccess(true);
      showUndoToast(
        `Saved "${noteTitle}" to Think documents.`,
        async () => {
          if (docId) {
            await fetch(`/api/think/documents/${docId}`, { method: 'DELETE' }).catch(() => null);
          }
          showToast({ message: 'Save undone.', type: 'neutral' });
        },
        { durationMs: 10000 }
      );

      setTimeout(() => {
        router.push('/think');
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving to Think.';
      showToast({ message: msg, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDraftToConnect = () => {
    if (isSaving) return;
    try {
      const draftMessage = `${title ? `${title}\n` : ''}${text}${url ? `\n${url}` : ''}`.trim();
      sessionStorage.setItem('nexora_connect_draft', draftMessage);

      showUndoToast(
        'Draft prepared for Connect.',
        () => {
          sessionStorage.removeItem('nexora_connect_draft');
          showToast({ message: 'Draft cleared.', type: 'neutral' });
        },
        { durationMs: 10000 }
      );

      setSavedSuccess(true);
      setTimeout(() => {
        router.push('/connect');
      }, 800);
    } catch {
      showToast({ message: 'Could not store draft.', type: 'error' });
    }
  };

  const handleDiscard = () => {
    showToast({ message: 'Shared item discarded.', type: 'neutral' });
    router.push('/');
  };

  if (authStatus === 'loading') {
    return (
      <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--ink-soft)' }}>
        <p>Verifying secure session…</p>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div
        role="region"
        aria-label="Authentication Required"
        style={{
          maxWidth: '540px',
          margin: '3rem auto',
          padding: '2rem',
          backgroundColor: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border, #e3e2d8)',
          borderRadius: '1.25rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }} aria-hidden="true">
          🔒
        </div>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Authentication Required
        </h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.925rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
          To securely receive and save shared content into your NEXORA workspace, please sign in to your account.
        </p>

        <div
          style={{
            backgroundColor: 'rgba(107, 114, 100, 0.08)',
            borderRadius: '0.75rem',
            padding: '0.75rem 1rem',
            fontSize: '0.8125rem',
            textAlign: 'left',
            marginBottom: '1.75rem',
            color: 'var(--ink-soft)',
          }}
        >
          <strong>Platform Notice:</strong> Web Share Target is supported on Android Chrome. iOS Safari does not support the Web Share Target API.
        </div>

        <button
          type="button"
          onClick={() => router.push('/login?next=/share-target')}
          style={{
            backgroundColor: 'var(--fg, #20231f)',
            color: 'var(--bg, #f4f3ed)',
            border: 'none',
            borderRadius: '0.75rem',
            padding: '0.75rem 1.75rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sign In to NEXORA
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Incoming Shared Item"
      style={{
        maxWidth: '640px',
        margin: '2rem auto',
        padding: '2rem 1.5rem',
        backgroundColor: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border, #e3e2d8)',
        borderRadius: '1.25rem',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '0.25rem 0.6rem',
            borderRadius: '999px',
            backgroundColor: 'var(--surface-raised, #f0f0eb)',
            color: 'var(--ink, #20231f)',
            border: '1px solid var(--line, #e3e2d8)',
          }}
        >
          Preview · Real device unverified (Android Chrome Only)
        </span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--ink-soft)' }}>
          Signed in as <strong>{userFullName}</strong>
        </span>
      </div>

      <h1 style={{ fontSize: '1.4rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
        Incoming Shared Content
      </h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--ink-soft)', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
        Review and edit the shared text before choosing where to store it. NEXORA never auto-posts shared content.
      </p>

      {/* iOS Safari Unsupported Notice */}
      <div
        role="note"
        style={{
          backgroundColor: 'rgba(214, 242, 106, 0.15)',
          border: '1px solid rgba(79, 107, 21, 0.25)',
          borderRadius: '0.75rem',
          padding: '0.75rem 1rem',
          fontSize: '0.8125rem',
          color: 'var(--fg, #20231f)',
          marginBottom: '1.5rem',
          lineHeight: 1.4,
        }}
      >
        <strong>Browser Compatibility Notice:</strong> Web Share Target is supported on <strong>Android Chrome</strong>.
        iOS Safari does not support the W3C Web Share Target API.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <label htmlFor="share-title" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
            Title (Optional)
          </label>
          <input
            id="share-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(sanitizeText(e.target.value, 200))}
            placeholder="Document or note title…"
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border, #e3e2d8)',
              backgroundColor: 'var(--bg, #f4f3ed)',
              color: 'var(--fg, #20231f)',
              fontSize: '0.9rem',
            }}
          />
        </div>

        <div>
          <label htmlFor="share-text" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
            Text Content
          </label>
          <textarea
            id="share-text"
            rows={5}
            value={text}
            onChange={(e) => setText(sanitizeText(e.target.value, 10000))}
            placeholder="Shared excerpt, article body, or notes…"
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border, #e3e2d8)',
              backgroundColor: 'var(--bg, #f4f3ed)',
              color: 'var(--fg, #20231f)',
              fontSize: '0.9rem',
              lineHeight: 1.5,
              resize: 'vertical',
            }}
          />
        </div>

        <div>
          <label htmlFor="share-url" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
            Source URL (Optional)
          </label>
          <input
            id="share-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(sanitizeUrl(e.target.value))}
            placeholder="https://example.com/article"
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border, #e3e2d8)',
              backgroundColor: 'var(--bg, #f4f3ed)',
              color: 'var(--fg, #20231f)',
              fontSize: '0.9rem',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: 0 }}>
          Choose Destination:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={handleSaveToThink}
            disabled={isSaving || savedSuccess}
            style={{
              flex: '1 1 180px',
              backgroundColor: 'var(--fg, #20231f)',
              color: 'var(--bg, #f4f3ed)',
              border: 'none',
              borderRadius: '0.65rem',
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: isSaving ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <span>▤</span>
            <span>{isSaving ? 'Saving…' : 'Save as Note in Think'}</span>
          </button>

          <button
            type="button"
            onClick={handleDraftToConnect}
            disabled={isSaving || savedSuccess}
            style={{
              flex: '1 1 180px',
              backgroundColor: 'transparent',
              color: 'var(--fg, #20231f)',
              border: '1px solid var(--border, #e3e2d8)',
              borderRadius: '0.65rem',
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <span>💬</span>
            <span>Draft in Connect</span>
          </button>

          <button
            type="button"
            onClick={handleDiscard}
            disabled={isSaving}
            style={{
              flex: '0 0 auto',
              backgroundColor: 'transparent',
              color: 'var(--ink-soft)',
              border: 'none',
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShareTargetPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-soft)' }}>
            Loading incoming shared content…
          </div>
        }
      >
        <ShareTargetContent />
      </Suspense>
    </AppShell>
  );
}
