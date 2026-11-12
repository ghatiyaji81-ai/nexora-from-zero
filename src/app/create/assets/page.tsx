import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { CreateAssetLibrary } from '@/components/create-asset-library';
import { getAuthenticatedContext } from '@/lib/server/auth-session';

export const metadata = { title: 'Creative asset library' };

export default async function CreateAssetsPage() {
  if (!await getAuthenticatedContext()) redirect('/login?next=%2Fcreate%2Fassets');
  return <AppShell><CreateAssetLibrary /></AppShell>;
}
