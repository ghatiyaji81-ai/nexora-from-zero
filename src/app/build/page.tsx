import { redirect } from 'next/navigation';
import { BuildDashboard } from '@/components/build-dashboard';
import { AppShell } from '@/components/app-shell';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'BUILD' };

export default async function BuildPage(props: { searchParams?: Promise<{ theme?: string }> }) {
  const searchParams = await props.searchParams;
  const context = await getAuthenticatedContext();
  const themeParam = searchParams?.theme ? `&theme=${encodeURIComponent(searchParams.theme)}` : '';
  if (!context) redirect(`/login?next=%2Fbuild${themeParam}`);
  return <AppShell><BuildDashboard /></AppShell>;
}
