import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { BuildWorkspace } from '@/components/build-workspace';
import { getAuthenticatedContext } from '@/lib/server/auth-session';
import { connectToDatabase } from '@/lib/server/db';
import { BuildProject } from '@/models/build-project';

type Props = { params: Promise<{ projectId: string }> };

export async function generateMetadata({ params }: Props) {
  const context = await getAuthenticatedContext();
  const { projectId } = await params;
  if (!context || !/^[a-f\d]{24}$/i.test(projectId)) return { title: 'Build project' };
  await connectToDatabase();
  const project = await BuildProject.findOne({ _id: projectId, ownerId: context.user.id }).select('title').lean();
  return { title: project?.title ?? 'Build project' };
}

export default async function BuildProjectPage({ params }: Props) {
  const context = await getAuthenticatedContext();
  if (!context) redirect('/login?next=%2Fbuild');
  const { projectId } = await params;
  if (!/^[a-f\d]{24}$/i.test(projectId)) notFound();
  await connectToDatabase();
  const project = await BuildProject.exists({ _id: projectId, ownerId: context.user.id });
  if (!project) notFound();
  return <AppShell><BuildWorkspace projectId={projectId} /></AppShell>;
}
