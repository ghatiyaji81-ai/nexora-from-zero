import mongoose from 'mongoose';
import { z } from 'zod';
import { requireBuild } from '@/lib/server/build';
import { storeBuildFile } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildApproval } from '@/models/build-approval';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';
import { MAX_BUILD_FILE_BYTES } from '@/lib/server/build-files';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const proposalSchema = z.object({
  fileId: z.string().regex(/^[a-f\d]{24}$/i),
  baseRevision: z.number().int().min(0),
  summary: z.string().trim().min(1).max(500),
  content: z.string().max(256 * 1024),
}).strict();

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'approval-list');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  const approvals = await BuildApproval.find({ ownerId, projectId }).sort({ createdAt: -1 }).limit(50).select('-ownerId -proposalFileId').lean();
  return jsonResponse({ approvals: approvals.map(approval => ({ ...approval, id: approval._id.toString() })) });
}

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'approval-create', 30);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const parsed = proposalSchema.safeParse(await parseJsonBody(request, 300 * 1024));
  if (!mongoose.isValidObjectId(projectId) || !parsed.success) return jsonResponse({ error: 'The proposed change is invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  const file = await BuildProjectFile.findOne({ _id: parsed.data.fileId, projectId, ownerId });
  if (!file) return jsonResponse({ error: 'File not found.' }, 404);
  if (file.revision !== parsed.data.baseRevision) return jsonResponse({ error: 'The file changed while the proposal was being prepared. Reload it first.' }, 409);
  const project = await BuildProject.exists({ _id: projectObjectId, ownerId, status: 'active' });
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  if (Buffer.byteLength(parsed.data.content, 'utf8') > MAX_BUILD_FILE_BYTES) return jsonResponse({ error: 'BUILD files must be 256 KB or smaller.' }, 413);
  let proposal: { fileId: mongoose.Types.ObjectId };
  try {
    proposal = await storeBuildFile(ownerId, projectObjectId, file.path, parsed.data.content, 'build-pending-proposal');
  } catch (error) {
    console.error('BUILD proposal storage failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The proposal could not be stored.' }, 503);
  }
  try {
    const approval = await BuildApproval.create({
      ownerId, projectId: projectObjectId, fileId: file._id, proposalFileId: proposal.fileId,
      path: file.path, summary: parsed.data.summary, baseRevision: file.revision,
    });
    return jsonResponse({ approval: { id: approval._id.toString(), path: approval.path, summary: approval.summary, baseRevision: approval.baseRevision, status: approval.status, createdAt: approval.createdAt } }, 201);
  } catch (error) {
    const { deleteBuildBlob } = await import('@/lib/server/build-files');
    await deleteBuildBlob(proposal.fileId).catch(() => undefined);
    throw error;
  }
}
