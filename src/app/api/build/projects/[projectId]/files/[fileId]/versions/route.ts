import mongoose from 'mongoose';
import { requireBuild } from '@/lib/server/build';
import { jsonResponse } from '@/lib/server/http';
import { BuildProjectFile } from '@/models/build-project-file';
import { BuildProjectFileVersion } from '@/models/build-project-file-version';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string; fileId: string }> };

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'file-version-list');
  if ('response' in gate) return gate.response;
  const { projectId, fileId } = await route.params;
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(fileId)) return jsonResponse({ error: 'File not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const file = await BuildProjectFile.exists({ _id: fileId, projectId, ownerId });
  if (!file) return jsonResponse({ error: 'File not found.' }, 404);
  const versions = await BuildProjectFileVersion.find({ ownerId, projectId, path: (await BuildProjectFile.findById(fileId).select('path').lean())!.path })
    .sort({ revision: -1 }).limit(20).select('path revision size createdAt').lean();
  return jsonResponse({ versions: versions.map(version => ({ id: version._id.toString(), path: version.path, revision: version.revision, size: version.size, createdAt: version.createdAt })) });
}
