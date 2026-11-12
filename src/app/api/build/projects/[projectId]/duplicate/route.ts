import mongoose from 'mongoose';
import { z } from 'zod';
import { requireBuild } from '@/lib/server/build';
import { deleteBuildBlob, readBuildFile, storeBuildFile } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const requestSchema = z.object({ title: z.string().trim().min(1).max(120).optional() }).strict();
const MAX_DUPLICATE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'project-duplicate', 10);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const parsed = requestSchema.safeParse(await parseJsonBody(request));
  if (!mongoose.isValidObjectId(projectId) || !parsed.success) return jsonResponse({ error: 'The duplicate request is invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const source = await BuildProject.findOne({ _id: projectId, ownerId }).lean();
  if (!source) return jsonResponse({ error: 'Project not found.' }, 404);
  const sourceFiles = await BuildProjectFile.find({ ownerId, projectId }).sort({ path: 1 }).limit(501).select('path fileId size').lean();
  if (sourceFiles.length > 500 || sourceFiles.reduce((sum, file) => sum + file.size, 0) > MAX_DUPLICATE_BYTES) {
    return jsonResponse({ error: 'This project is too large to duplicate in one request. Export or copy files individually.' }, 413);
  }
  const fileContents: Array<{ path: string; content: string }> = [];
  for (const file of sourceFiles) {
    const content = await readBuildFile(file.fileId, ownerId, new mongoose.Types.ObjectId(projectId));
    if (content === null) return jsonResponse({ error: `File content is unavailable: ${file.path}` }, 503);
    fileContents.push({ path: file.path, content });
  }
  const duplicate = await BuildProject.create({
    ownerId,
    title: parsed.data.title ?? `Copy of ${source.title}`.slice(0, 120),
    description: source.description,
    template: source.template,
    tags: source.tags,
  });
  const createdBlobs: mongoose.Types.ObjectId[] = [];
  try {
    for (const file of fileContents) {
      const stored = await storeBuildFile(ownerId, duplicate._id, file.path, file.content);
      createdBlobs.push(stored.fileId);
      await BuildProjectFile.create({ ownerId, projectId: duplicate._id, path: file.path, fileId: stored.fileId, size: stored.size });
    }
    return jsonResponse({ project: { id: duplicate._id.toString(), title: duplicate.title, description: duplicate.description, template: duplicate.template, status: duplicate.status, createdAt: duplicate.createdAt, updatedAt: duplicate.updatedAt } }, 201);
  } catch (error) {
    await BuildProjectFile.deleteMany({ ownerId, projectId: duplicate._id });
    await Promise.all(createdBlobs.map(fileId => deleteBuildBlob(fileId).catch(() => undefined)));
    await duplicate.deleteOne();
    console.error('BUILD project duplication failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The project could not be duplicated.' }, 503);
  }
}
