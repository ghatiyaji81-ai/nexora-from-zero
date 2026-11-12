import mongoose from 'mongoose';
import { z } from 'zod';
import { safeBuildPath } from '@/lib/build';
import { requireBuild } from '@/lib/server/build';
import { deleteBuildBlob, MAX_BUILD_FILE_BYTES, storeBuildFile } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';
import { BuildProjectFileVersion } from '@/models/build-project-file-version';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const fileSchema = z.object({ path: z.string().min(1).max(240), content: z.string().max(256 * 1024) }).strict();

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'file-list');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  const files = await BuildProjectFile.find({ ownerId, projectId }).sort({ path: 1 }).limit(500).select('path size revision updatedAt').lean();
  return jsonResponse({ files: files.map(file => ({ id: file._id.toString(), path: file.path, size: file.size, revision: file.revision, updatedAt: file.updatedAt })) });
}

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'file-create', 90);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const parsed = fileSchema.safeParse(await parseJsonBody(request, 300 * 1024));
  const path = parsed.success ? safeBuildPath(parsed.data.path) : null;
  if (!mongoose.isValidObjectId(projectId) || !parsed.success || !path) return jsonResponse({ error: 'Enter a safe relative file path and text content.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId, status: 'active' })) return jsonResponse({ error: 'Project not found or is archived.' }, 404);
  if (await BuildProjectFile.countDocuments({ ownerId, projectId }) >= 500) return jsonResponse({ error: 'A project can contain at most 500 files.' }, 413);
  if (await BuildProjectFile.exists({ ownerId, projectId, path })) return jsonResponse({ error: 'A file already exists at that path.' }, 409);
  if (Buffer.byteLength(parsed.data.content, 'utf8') > MAX_BUILD_FILE_BYTES) return jsonResponse({ error: 'BUILD files must be 256 KB or smaller.' }, 413);
  const previousVersion = await BuildProjectFileVersion.findOne({ ownerId, projectId, path }).sort({ revision: -1 }).select('revision').lean();
  const revision = (previousVersion?.revision ?? -1) + 1;
  let stored: { fileId: mongoose.Types.ObjectId; size: number };
  try {
    stored = await storeBuildFile(ownerId, new mongoose.Types.ObjectId(projectId), path, parsed.data.content);
  } catch (error) {
    console.error('BUILD file creation failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The file could not be stored.' }, 503);
  }
  try {
    const file = await BuildProjectFile.create({ ownerId, projectId, path, fileId: stored.fileId, size: stored.size, revision });
    await BuildProject.updateOne({ _id: projectId, ownerId }, { $set: { updatedAt: new Date() } });
    return jsonResponse({ file: { id: file._id.toString(), path: file.path, size: file.size, revision: file.revision } }, 201);
  } catch (error) {
    await deleteBuildBlob(stored.fileId).catch(() => undefined);
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) return jsonResponse({ error: 'A file already exists at that path.' }, 409);
    throw error;
  }
}
