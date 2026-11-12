import mongoose from 'mongoose';
import { z } from 'zod';
import { requireBuild } from '@/lib/server/build';
import { deleteBuildBlob } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';
import { BuildProjectFileVersion } from '@/models/build-project-file-version';
import { BuildApproval } from '@/models/build-approval';
import { BuildSecurityScan } from '@/models/build-security-scan';
import { BuildExecutionLog } from '@/models/build-execution-log';
import { BuildExecutionSession } from '@/models/build-execution-session';
import { BuildGitRepository } from '@/models/build-git-repository';
import { BuildPreviewSession } from '@/models/build-preview-session';
import { BuildRuntimeError } from '@/models/build-runtime-error';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  status: z.enum(['active', 'archived']).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
}).strict().refine(value => Object.keys(value).length > 0);

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'project-read');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const project = await BuildProject.findOne({ _id: projectId, ownerId }).select('-ownerId').lean();
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  const files = await BuildProjectFile.find({ projectId, ownerId }).sort({ path: 1 }).limit(500).select('path size revision updatedAt').lean();
  return jsonResponse({ project: { ...project, id: project._id.toString() }, files: files.map(file => ({ id: file._id.toString(), path: file.path, size: file.size, revision: file.revision, updatedAt: file.updatedAt })) });
}

export async function PATCH(request: Request, route: Context) {
  const gate = await requireBuild(request, 'project-update', 120);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const parsed = updateSchema.safeParse(await parseJsonBody(request));
  if (!mongoose.isValidObjectId(projectId) || !parsed.success) return jsonResponse({ error: 'The project update is invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (parsed.data.status === 'archived' && (
    await BuildExecutionSession.exists({ ownerId, projectId, status: { $ne: 'stopped' } }) ||
    await BuildPreviewSession.exists({ ownerId, projectId, status: { $in: ['starting', 'running'] } })
  )) {
    return jsonResponse({ error: 'Stop isolated execution and preview sessions and synchronize any changes before archiving this project.' }, 409);
  }
  const project = await BuildProject.findOneAndUpdate(
    { _id: projectId, ownerId },
    { $set: parsed.data }, { new: true, runValidators: true },
  ).select('-ownerId').lean();
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  return jsonResponse({ project: { ...project, id: project._id.toString() } });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireBuild(request, 'project-delete', 15);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const project = await BuildProject.findOne({ _id: projectId, ownerId });
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  if (
    await BuildExecutionSession.exists({ ownerId, projectId, status: { $ne: 'stopped' } }) ||
    await BuildPreviewSession.exists({ ownerId, projectId, status: { $in: ['starting', 'running'] } })
  ) {
    return jsonResponse({ error: 'Stop isolated execution and preview sessions before deleting this project. Synchronize any wanted workspace changes first.' }, 409);
  }
  const [files, versions, approvals] = await Promise.all([
    BuildProjectFile.find({ ownerId, projectId }).select('fileId').lean(),
    BuildProjectFileVersion.find({ ownerId, projectId }).select('fileId').lean(),
    BuildApproval.find({ ownerId, projectId }).select('proposalFileId').lean(),
    BuildExecutionSession.deleteMany({ ownerId, projectId }),
    BuildExecutionLog.deleteMany({ ownerId, projectId }),
    BuildGitRepository.deleteMany({ ownerId, projectId }),
    BuildPreviewSession.deleteMany({ ownerId, projectId }),
    BuildRuntimeError.deleteMany({ ownerId, projectId }),
  ]);
  await Promise.all([
    BuildProjectFile.deleteMany({ ownerId, projectId }),
    BuildProjectFileVersion.deleteMany({ ownerId, projectId }),
    BuildApproval.deleteMany({ ownerId, projectId }),
    BuildSecurityScan.deleteMany({ ownerId, projectId }),
    project.deleteOne(),
  ]);
  const blobIds = new Map([...files, ...versions].map(file => [file.fileId.toString(), file.fileId]));
  for (const approval of approvals) blobIds.set(approval.proposalFileId.toString(), approval.proposalFileId);
  const results = await Promise.allSettled([...blobIds.values()].map(deleteBuildBlob));
  if (results.some(result => result.status === 'rejected')) {
    console.error('BUILD project file cleanup was incomplete.', { projectId, failedBlobs: results.filter(result => result.status === 'rejected').length });
    return jsonResponse({ error: 'Project metadata was deleted, but private file cleanup needs attention.' }, 503);
  }
  return jsonResponse({ success: true });
}
