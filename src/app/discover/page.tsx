import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { DiscoverDashboard } from '@/components/discover-dashboard';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'Discover research' };

export default async function DiscoverPage() {
  const context = await getAuthenticatedContext();
  if (!context) redirect('/login?next=%2Fdiscover');
  return <AppShell><DiscoverDashboard displayName={context.profile?.displayName ?? context.user.fullName} /></AppShell>;
}
