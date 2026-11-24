import { notFound, redirect } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'My workspace' };

export default async function WorkspacePage() {
  const context = await getAuthenticatedContext();
  if (!context) redirect('/login?next=%2Fworkspace');
  if (!context.permission || (!['owner', 'admin'].includes(context.permission.role)
    && !context.permission.grants.includes('workspace:read'))) {
    notFound();
  }

  const displayName = context.profile?.displayName ?? context.user.fullName;
  return (
    <main className="account-page">
      <header className="account-header">
        <a className="auth-brand" href="/"><span aria-hidden="true">N</span>NEXORA</a>
        <LogoutButton />
      </header>
      <section className="account-card" aria-labelledby="account-title">
        <p className="auth-eyebrow">PRIVATE WORKSPACE</p>
        <h1 id="account-title">Welcome, {displayName}.</h1>
        <p>Your account is connected to NEXORA. Your sign-in session is stored on the server and your browser holds only an HttpOnly session token.</p>
        <dl className="account-details">
          <div><dt>Email</dt><dd>{context.user.email}</dd></div>
          <div><dt>Workspace access</dt><dd>{context.permission?.role ?? 'member'}</dd></div>
          <div><dt>Profile language</dt><dd>{context.profile?.locale === 'hi' ? 'Hindi' : 'English'}</dd></div>
        </dl>
        <a className="button button-primary" href="/">Return to your overview <span aria-hidden="true">→</span></a>
      </section>
    </main>
  );
}
