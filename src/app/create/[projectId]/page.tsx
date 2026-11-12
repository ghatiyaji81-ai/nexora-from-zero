import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { CreateEditor } from '@/components/create-editor';
import { getAuthenticatedContext } from '@/lib/server/auth-session';
import { CreateProject } from '@/models/create-project';
import { connectToDatabase } from '@/lib/server/db';

type Props = { params: Promise<{ projectId: string }> };

export async function generateMetadata({ params }: Props) {
  const context = await getAuthenticatedContext();
  const { projectId } = await params;
  if (!context || !/^[a-f\d]{24}$/i.test(projectId)) return { title: 'Creative project' };
  await connectToDatabase();
  const project = await CreateProject.findOne({ _id: projectId, ownerId: context.user.id }).select('title').lean();
  return { title: project?.title ?? 'Creative project' };
}

export default async function CreateProjectPage({ params }: Props) {
  const context = await getAuthenticatedContext();
  if (!context) redirect('/login?next=%2Fcreate');
  const { projectId } = await params;
  if (!/^[a-f\d]{24}$/i.test(projectId)) notFound();
  await connectToDatabase();
  const project = await CreateProject.exists({ _id: projectId, ownerId: context.user.id });
  if (!project) notFound();
  return <AppShell><CreateEditor projectId={projectId} /></AppShell>;
}
