import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { SpeakWorkspace } from '@/components/speak-workspace';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'Speak voice workspace' };

export default async function SpeakPage() {
  const context = await getAuthenticatedContext();
  if (!context) redirect('/login?next=%2Fspeak');
  return <AppShell><SpeakWorkspace displayName={context.profile?.displayName ?? context.user.fullName} /></AppShell>;
}
