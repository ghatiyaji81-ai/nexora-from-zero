import mongoose from 'mongoose';
import { z } from 'zod';
import { getBuildTemplateFiles, isBuildTemplateId, type BuildTemplateId } from '@/lib/build';
import { requireBuild } from '@/lib/server/build';
import { deleteBuildBlob, storeBuildFile } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';

export const runtime = 'nodejs';
const projectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  template: z.custom<BuildTemplateId>(isBuildTemplateId, 'Choose a supported starter.'),
}).strict();

export async function GET(request: Request) {
  const gate = await requireBuild(request, 'project-list');
  if ('response' in gate) return gate.response;
  const params = new URL(request.url).searchParams;
  const filter: Record<string, unknown> = { ownerId: new mongoose.Types.ObjectId(gate.context.user.id) };
  filter.status = params.get('status') === 'archived' ? 'archived' : 'active';
  const query = params.get('q')?.trim().slice(0, 80);
  if (query) filter.$text = { $search: query };
  const projects = await BuildProject.find(filter)
    .sort(query ? { score: { $meta: 'textScore' } } : { updatedAt: -1 }).limit(100).select('-ownerId').lean();
  const counts = await BuildProjectFile.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { ownerId: new mongoose.Types.ObjectId(gate.context.user.id), projectId: { $in: projects.map(project => project._id) } } },
    { $group: { _id: '$projectId', count: { $sum: 1 } } },
  ]);
  const countByProject = new Map(counts.map(item => [item._id.toString(), item.count]));
  return jsonResponse({ projects: projects.map(project => ({ ...project, id: project._id.toString(), fileCount: countByProject.get(project._id.toString()) ?? 0 })) });
}

export async function POST(request: Request) {
  const gate = await requireBuild(request, 'project-create', 30);
  if ('response' in gate) return gate.response;
  const parsed = projectSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return jsonResponse({ error: 'Provide a title and an available starter template.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const project = await BuildProject.create({
    ownerId, title: parsed.data.title, description: parsed.data.description ?? '', template: parsed.data.template,
  });
  const files = getBuildTemplateFiles(parsed.data.template, parsed.data.title);
  const createdBlobs: mongoose.Types.ObjectId[] = [];
  try {
    for (const file of files) {
      const stored = await storeBuildFile(ownerId, project._id, file.path, file.content);
      createdBlobs.push(stored.fileId);
      await BuildProjectFile.create({ ownerId, projectId: project._id, path: file.path, fileId: stored.fileId, size: stored.size });
    }
    return jsonResponse({ project: { id: project._id.toString(), title: project.title, description: project.description, template: project.template, status: project.status, createdAt: project.createdAt, updatedAt: project.updatedAt }, files: files.map(file => file.path) }, 201);
  } catch (error) {
    await BuildProjectFile.deleteMany({ ownerId, projectId: project._id });
    await Promise.all(createdBlobs.map(fileId => deleteBuildBlob(fileId).catch(() => undefined)));
    await project.deleteOne();
    console.error('BUILD project initialization failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The starter files could not be stored. Please retry.' }, 503);
  }
}
