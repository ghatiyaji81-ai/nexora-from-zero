import mongoose from 'mongoose';
import { requireBuild } from '@/lib/server/build';
import { deleteBuildBlob, readBuildFile, retainBuildFileVersion, storeBuildFile } from '@/lib/server/build-files';
import { jsonResponse } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';
import { BuildProjectFileVersion } from '@/models/build-project-file-version';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'project-version-list');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  const versions = await BuildProjectFileVersion.find({ ownerId, projectId }).sort({ createdAt: -1 }).limit(100).select('path revision size createdAt').lean();
  return jsonResponse({ versions: versions.map(version => ({ id: version._id.toString(), path: version.path, revision: version.revision, size: version.size, createdAt: version.createdAt })) });
}

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'project-version-restore', 25);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const versionId = new URL(request.url).searchParams.get('versionId');
  if (!mongoose.isValidObjectId(projectId) || !versionId || !mongoose.isValidObjectId(versionId)) return jsonResponse({ error: 'Choose a saved file version.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  if (!await BuildProject.exists({ _id: projectObjectId, ownerId, status: 'active' })) return jsonResponse({ error: 'Project not found or is archived.' }, 404);
  const version = await BuildProjectFileVersion.findOne({ _id: versionId, ownerId, projectId: projectObjectId });
  if (!version) return jsonResponse({ error: 'Project file version not found.' }, 404);
  const content = await readBuildFile(version.fileId, ownerId, projectObjectId);
  if (content === null) return jsonResponse({ error: 'The saved file version is unavailable.' }, 404);
  const current = await BuildProjectFile.findOne({ ownerId, projectId: projectObjectId, path: version.path });
  let newBlob: { fileId: mongoose.Types.ObjectId; size: number };
  try {
    newBlob = await storeBuildFile(ownerId, projectObjectId, version.path, content);
  } catch (error) {
    console.error('BUILD project version restore failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The version could not be restored.' }, 503);
  }
  if (!current) {
    try {
      const latestVersion = await BuildProjectFileVersion.findOne({ ownerId, projectId: projectObjectId, path: version.path }).sort({ revision: -1 }).select('revision').lean();
      const revision = Math.max(version.revision, latestVersion?.revision ?? -1) + 1;
      const restored = await BuildProjectFile.create({ ownerId, projectId: projectObjectId, path: version.path, fileId: newBlob.fileId, size: newBlob.size, revision });
      await BuildProject.updateOne({ _id: projectObjectId, ownerId }, { $set: { updatedAt: new Date() } });
      return jsonResponse({ file: { id: restored._id.toString(), path: restored.path, size: restored.size, revision: restored.revision } });
    } catch (error) {
      await deleteBuildBlob(newBlob.fileId).catch(() => undefined);
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) return jsonResponse({ error: 'A file already exists at that path.' }, 409);
      throw error;
    }
  }
  const revision = current.revision;
  try {
    await retainBuildFileVersion({ ownerId, projectId: projectObjectId, fileId: current.fileId, path: current.path, size: current.size, revision });
  } catch (error) {
    await deleteBuildBlob(newBlob.fileId).catch(() => undefined);
    throw error;
  }
  const restored = await BuildProjectFile.findOneAndUpdate(
    { _id: current._id, ownerId, projectId: projectObjectId, revision },
    { $set: { fileId: newBlob.fileId, size: newBlob.size }, $inc: { revision: 1 } }, { new: true },
  ).select('path size revision').lean();
  if (!restored) {
    await deleteBuildBlob(newBlob.fileId).catch(() => undefined);
    return jsonResponse({ error: 'The file changed before the version could be restored.' }, 409);
  }
  await BuildProject.updateOne({ _id: projectObjectId, ownerId }, { $set: { updatedAt: new Date() } });
  return jsonResponse({ file: { id: restored._id.toString(), path: restored.path, size: restored.size, revision: restored.revision } });
}
