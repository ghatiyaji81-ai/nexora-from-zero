import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ConnectWorkspace } from '@/components/connect-workspace';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'Connect' };

export default async function ConnectPage(props: { searchParams?: Promise<{ theme?: string }> }) {
  const searchParams = await props.searchParams;
  const context = await getAuthenticatedContext();
  const themeParam = searchParams?.theme ? `&theme=${encodeURIComponent(searchParams.theme)}` : '';
  if (!context) redirect(`/login?next=%2Fconnect${themeParam}`);
  return <AppShell><ConnectWorkspace user={{ id: context.user.id, name: context.profile?.displayName ?? context.user.fullName, email: context.user.email }} /></AppShell>;
}
