import mongoose from 'mongoose';
import { z } from 'zod';
import { safeBuildPath } from '@/lib/build';
import { requireBuild } from '@/lib/server/build';
import { deleteBuildBlob, MAX_BUILD_FILE_BYTES, readBuildFile, retainBuildFileVersion, storeBuildFile } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string; fileId: string }> };
const updateSchema = z.object({
  path: z.string().min(1).max(240).optional(),
  content: z.string().max(256 * 1024).optional(),
  revision: z.number().int().min(0),
}).strict().refine(value => value.path !== undefined || value.content !== undefined);
const renameSchema = updateSchema.refine(value => value.path === undefined || value.content !== undefined);

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'file-read');
  if ('response' in gate) return gate.response;
  const { projectId, fileId } = await route.params;
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(fileId)) return jsonResponse({ error: 'File not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const file = await BuildProjectFile.findOne({ _id: fileId, projectId, ownerId }).select('-ownerId').lean();
  if (!file) return jsonResponse({ error: 'File not found.' }, 404);
  const content = await readBuildFile(file.fileId, ownerId, new mongoose.Types.ObjectId(projectId));
  if (content === null) return jsonResponse({ error: 'File content is unavailable.' }, 404);
  return jsonResponse({ file: { id: file._id.toString(), path: file.path, size: file.size, revision: file.revision, updatedAt: file.updatedAt, content } });
}

export async function PATCH(request: Request, route: Context) {
  const gate = await requireBuild(request, 'file-save', 240);
  if ('response' in gate) return gate.response;
  const { projectId, fileId } = await route.params;
  const parsed = renameSchema.safeParse(await parseJsonBody(request, 300 * 1024));
  const path = parsed.success && parsed.data.path !== undefined ? safeBuildPath(parsed.data.path) : undefined;
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(fileId) || !parsed.success || (parsed.data.path !== undefined && !path)) {
    return jsonResponse({ error: 'The file update is invalid.' }, 400);
  }
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  if (!await BuildProject.exists({ _id: projectObjectId, ownerId, status: 'active' })) return jsonResponse({ error: 'Project not found or is archived.' }, 404);
  const file = await BuildProjectFile.findOne({ _id: fileId, projectId, ownerId });
  if (!file) return jsonResponse({ error: 'File not found.' }, 404);
  if (file.revision !== parsed.data.revision) return jsonResponse({ error: 'This file changed elsewhere. Reload it before saving again.' }, 409);
  const nextPath = path ?? file.path;
  if (nextPath !== file.path && await BuildProjectFile.exists({ ownerId, projectId, path: nextPath, _id: { $ne: file._id } })) {
    return jsonResponse({ error: 'A file already exists at that path.' }, 409);
  }
  const contentChanged = parsed.data.content !== undefined;
  if (contentChanged && Buffer.byteLength(parsed.data.content!, 'utf8') > MAX_BUILD_FILE_BYTES) {
    return jsonResponse({ error: 'BUILD files must be 256 KB or smaller.' }, 413);
  }
  let nextFileId = file.fileId;
  let nextSize = file.size;
  if (contentChanged) {
    try {
      const stored = await storeBuildFile(ownerId, projectObjectId, nextPath, parsed.data.content!);
      nextFileId = stored.fileId;
      nextSize = stored.size;
    } catch (error) {
      console.error('BUILD file save failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
      return jsonResponse({ error: 'The file could not be stored.' }, 503);
    }
  }
  try {
    await retainBuildFileVersion({ ownerId, projectId: projectObjectId, fileId: file.fileId, path: file.path, size: file.size, revision: file.revision });
  } catch (error) {
    if (contentChanged) await deleteBuildBlob(nextFileId).catch(() => undefined);
    throw error;
  }
  const updated = await BuildProjectFile.findOneAndUpdate(
    { _id: file._id, ownerId, projectId, revision: file.revision },
    { $set: { path: nextPath, fileId: nextFileId, size: nextSize }, $inc: { revision: 1 } },
    { new: true, runValidators: true },
  ).select('path size revision updatedAt').lean();
  if (!updated) {
    if (contentChanged) await deleteBuildBlob(nextFileId).catch(() => undefined);
    return jsonResponse({ error: 'This file changed elsewhere. Reload it before saving again.' }, 409);
  }
  await BuildProject.updateOne({ _id: projectId, ownerId }, { $set: { updatedAt: new Date() } });
  return jsonResponse({ file: { id: updated._id.toString(), path: updated.path, size: updated.size, revision: updated.revision, updatedAt: updated.updatedAt } });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireBuild(request, 'file-delete', 40);
  if ('response' in gate) return gate.response;
  const { projectId, fileId } = await route.params;
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(fileId)) return jsonResponse({ error: 'File not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId, status: 'active' })) return jsonResponse({ error: 'Project not found or is archived.' }, 404);
  const file = await BuildProjectFile.findOne({ _id: fileId, projectId, ownerId });
  if (!file) return jsonResponse({ error: 'File not found.' }, 404);
  await retainBuildFileVersion({ ownerId, projectId: file.projectId, fileId: file.fileId, path: file.path, size: file.size, revision: file.revision });
  await file.deleteOne();
  await BuildProject.updateOne({ _id: projectId, ownerId }, { $set: { updatedAt: new Date() } });
  return jsonResponse({ success: true });
}
