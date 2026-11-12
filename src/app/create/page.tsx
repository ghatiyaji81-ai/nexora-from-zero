import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { CreateDashboard } from '@/components/create-dashboard';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'Create studio' };

export default async function CreatePage() {
  const context = await getAuthenticatedContext();
  if (!context) redirect('/login?next=%2Fcreate');
  return <AppShell><CreateDashboard displayName={context.profile?.displayName ?? context.user.fullName} /></AppShell>;
}
