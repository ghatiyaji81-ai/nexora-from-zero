import { redirect } from 'next/navigation';
import { BuildDashboard } from '@/components/build-dashboard';
import { AppShell } from '@/components/app-shell';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'BUILD' };

export default async function BuildPage() {
  const context = await getAuthenticatedContext();
  if (!context) redirect('/login?next=%2Fbuild');
  return <AppShell><BuildDashboard /></AppShell>;
}
