import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ThinkWorkspace } from '@/components/think-workspace';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'Think intelligence center' };

export default async function ThinkPage() {
  const context = await getAuthenticatedContext();
  if (!context) redirect('/login?next=%2Fthink');
  return <AppShell><ThinkWorkspace displayName={context.profile?.displayName ?? context.user.fullName} /></AppShell>;
}
