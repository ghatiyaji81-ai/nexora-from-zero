import { redirect } from 'next/navigation';
import { ConnectWorkspace } from '@/components/connect-workspace';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'Connect' };

export default async function ConnectPage() {
  const context = await getAuthenticatedContext();
  if (!context) redirect('/login?next=%2Fconnect');
  return <ConnectWorkspace user={{ id: context.user.id, name: context.profile?.displayName ?? context.user.fullName, email: context.user.email }} />;
}
