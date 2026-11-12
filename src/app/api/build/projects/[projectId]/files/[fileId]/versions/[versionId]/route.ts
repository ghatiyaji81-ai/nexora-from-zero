import mongoose from 'mongoose';
import { requireBuild } from '@/lib/server/build';
import { deleteBuildBlob, readBuildFile, retainBuildFileVersion, storeBuildFile } from '@/lib/server/build-files';
import { jsonResponse } from '@/lib/server/http';
import { BuildProjectFile } from '@/models/build-project-file';
import { BuildProjectFileVersion } from '@/models/build-project-file-version';
import { BuildProject } from '@/models/build-project';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string; fileId: string; versionId: string }> };

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'file-version-restore', 30);
  if ('response' in gate) return gate.response;
  const { projectId, fileId, versionId } = await route.params;
  if (![projectId, fileId, versionId].every(mongoose.isValidObjectId)) return jsonResponse({ error: 'Version not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId, status: 'active' })) return jsonResponse({ error: 'Project not found or is archived.' }, 404);
  const file = await BuildProjectFile.findOne({ _id: fileId, projectId, ownerId });
  const version = await BuildProjectFileVersion.findOne({ _id: versionId, ownerId, projectId });
  if (!file || !version || version.path !== file.path) return jsonResponse({ error: 'Version not found for this file.' }, 404);
  const content = await readBuildFile(version.fileId, ownerId, file.projectId);
  if (content === null) return jsonResponse({ error: 'The saved version is unavailable.' }, 404);
  let nextBlob: { fileId: mongoose.Types.ObjectId; size: number } | null = null;
  try {
    nextBlob = await storeBuildFile(ownerId, file.projectId, file.path, content);
    await retainBuildFileVersion({ ownerId, projectId: file.projectId, fileId: file.fileId, path: file.path, size: file.size, revision: file.revision });
  } catch (error) {
    if (nextBlob) await deleteBuildBlob(nextBlob.fileId).catch(() => undefined);
    return jsonResponse({ error: error instanceof Error ? error.message : 'The version could not be restored.' }, 503);
  }
  const restored = await BuildProjectFile.findOneAndUpdate(
    { _id: file._id, ownerId, projectId, revision: file.revision },
    { $set: { fileId: nextBlob.fileId, size: nextBlob.size }, $inc: { revision: 1 } },
    { new: true },
  ).select('path size revision updatedAt').lean();
  if (!restored) {
    await deleteBuildBlob(nextBlob.fileId).catch(() => undefined);
    return jsonResponse({ error: 'This file changed elsewhere. Reload it before restoring again.' }, 409);
  }
  await BuildProject.updateOne({ _id: projectId, ownerId }, { $set: { updatedAt: new Date() } });
  return jsonResponse({ file: { id: restored._id.toString(), path: restored.path, size: restored.size, revision: restored.revision, updatedAt: restored.updatedAt } });
}
