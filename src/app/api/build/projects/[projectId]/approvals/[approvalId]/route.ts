import mongoose from 'mongoose';
import { z } from 'zod';
import { requireBuild } from '@/lib/server/build';
import { deleteBuildBlob, readBuildFile, retainBuildFileVersion, storeBuildFile } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildApproval } from '@/models/build-approval';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string; approvalId: string }> };
const actionSchema = z.object({ action: z.enum(['approve', 'reject']) }).strict();

export async function PATCH(request: Request, route: Context) {
  const gate = await requireBuild(request, 'approval-decision', 30);
  if ('response' in gate) return gate.response;
  const { projectId, approvalId } = await route.params;
  const parsed = actionSchema.safeParse(await parseJsonBody(request));
  if (![projectId, approvalId].every(mongoose.isValidObjectId) || !parsed.success) return jsonResponse({ error: 'The approval decision is invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  const approval = await BuildApproval.findOne({ _id: approvalId, ownerId, projectId: projectObjectId, status: 'pending' });
  if (!approval) return jsonResponse({ error: 'Pending approval not found.' }, 404);
  if (parsed.data.action === 'reject') {
    approval.status = 'rejected';
    await approval.save();
    await deleteBuildBlob(approval.proposalFileId).catch(error => {
      console.error('BUILD rejected proposal cleanup failed.', { approvalId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    });
    return jsonResponse({ status: approval.status });
  }
  if (!await BuildProject.exists({ _id: projectObjectId, ownerId, status: 'active' })) return jsonResponse({ error: 'Project not found or is archived.' }, 404);
  const claimed = await BuildApproval.findOneAndUpdate(
    { _id: approval._id, ownerId, projectId: projectObjectId, status: 'pending' },
    { $set: { status: 'applying' } }, { new: true },
  );
  if (!claimed) return jsonResponse({ error: 'This approval is already being handled.' }, 409);
  const file = await BuildProjectFile.findOne({ _id: claimed.fileId, ownerId, projectId: projectObjectId });
  if (!file || file.revision !== claimed.baseRevision) {
    claimed.status = 'stale';
    await claimed.save();
    await deleteBuildBlob(claimed.proposalFileId).catch(() => undefined);
    return jsonResponse({ error: 'The file changed after this proposal was created. Ask THINK for a fresh proposal.' }, 409);
  }
  const content = await readBuildFile(claimed.proposalFileId, ownerId, projectObjectId);
  if (content === null) {
    claimed.status = 'stale';
    await claimed.save();
    await deleteBuildBlob(claimed.proposalFileId).catch(() => undefined);
    return jsonResponse({ error: 'The proposal content is unavailable.' }, 503);
  }
  let nextBlob: { fileId: mongoose.Types.ObjectId; size: number } | null = null;
  try {
    nextBlob = await storeBuildFile(ownerId, projectObjectId, file.path, content);
    await retainBuildFileVersion({ ownerId, projectId: projectObjectId, fileId: file.fileId, path: file.path, size: file.size, revision: file.revision });
  } catch (error) {
    claimed.status = 'pending';
    await claimed.save();
    if (nextBlob) await deleteBuildBlob(nextBlob.fileId).catch(() => undefined);
    return jsonResponse({ error: error instanceof Error ? error.message : 'The approved change could not be prepared.' }, 503);
  }
  if (!nextBlob) return jsonResponse({ error: 'The approved change could not be prepared.' }, 503);
  const updated = await BuildProjectFile.findOneAndUpdate(
    { _id: file._id, ownerId, projectId: projectObjectId, revision: claimed.baseRevision },
    { $set: { fileId: nextBlob.fileId, size: nextBlob.size }, $inc: { revision: 1 } }, { new: true },
  ).select('path revision size').lean();
  if (!updated) {
    await deleteBuildBlob(nextBlob.fileId).catch(() => undefined);
    claimed.status = 'stale';
    await claimed.save();
    await deleteBuildBlob(claimed.proposalFileId).catch(() => undefined);
    return jsonResponse({ error: 'The file changed before this approval could be applied.' }, 409);
  }
  claimed.status = 'approved';
  await claimed.save();
  await deleteBuildBlob(claimed.proposalFileId).catch(error => {
    console.error('BUILD applied proposal cleanup failed.', { approvalId, errorName: error instanceof Error ? error.name : 'UnknownError' });
  });
  return jsonResponse({ status: claimed.status, file: { id: updated._id.toString(), path: updated.path, revision: updated.revision, size: updated.size } });
}
