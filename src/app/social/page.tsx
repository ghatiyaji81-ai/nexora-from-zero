import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { SocialWorkspace } from '@/components/social-workspace';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'Social' };

export default async function SocialPage() {
  const context = await getAuthenticatedContext();
  if (!context) redirect('/login?next=%2Fsocial');
  return <AppShell><SocialWorkspace displayName={context.profile?.displayName ?? context.user.fullName} /></AppShell>;
}
