import mongoose from 'mongoose';
import { z } from 'zod';
import { detectBuildPreviewTarget } from '@/lib/build-preview';
import { getBuildPreviewProvider } from '@/lib/server/build-preview-provider';
import { requireBuild } from '@/lib/server/build';
import { readBuildFile } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildExecutionSession } from '@/models/build-execution-session';
import { BuildPreviewSession } from '@/models/build-preview-session';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const previewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), sessionId: z.string().regex(/^[a-f\d]{24}$/i) }).strict(),
  z.object({ action: z.literal('restart'), sessionId: z.string().regex(/^[a-f\d]{24}$/i), previewId: z.string().regex(/^[a-f\d]{24}$/i) }).strict(),
  z.object({ action: z.literal('stop'), previewId: z.string().regex(/^[a-f\d]{24}$/i) }).strict(),
  z.object({ action: z.literal('reload'), previewId: z.string().regex(/^[a-f\d]{24}$/i) }).strict(),
]);

async function detectProjectTarget(projectId: string, ownerId: mongoose.Types.ObjectId) {
  const files = await BuildProjectFile.find({ ownerId, projectId }).sort({ path: 1 }).limit(500)
    .select('path fileId size').lean();
  const candidates = files.filter(file =>
    file.path.toLowerCase() === 'package.json' ||
    file.path.toLowerCase() === 'index.html' ||
    /(^|\/)(next|vite|webpack)\.config\.[cm]?[jt]sx?$/.test(file.path.toLowerCase()),
  );
  const inputs = [];
  for (const file of candidates) {
    const content = await readBuildFile(file.fileId, ownerId, new mongoose.Types.ObjectId(projectId));
    if (content === null) throw new Error(`Project file is unavailable: ${file.path}`);
    inputs.push({ path: file.path, content });
  }
  return { target: detectBuildPreviewTarget(inputs), fileCount: files.length };
}

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'preview-status');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  try {
    const [{ target }, sessions, executionSessions] = await Promise.all([
      detectProjectTarget(projectId, ownerId),
      BuildPreviewSession.find({ ownerId, projectId }).sort({ createdAt: -1 }).limit(10)
        .select('executionSessionId framework runtime status startedAt stoppedAt lastError createdAt').lean(),
      BuildExecutionSession.find({ ownerId, projectId, status: 'active', busy: false }).sort({ startedAt: -1 }).limit(3)
        .select('runtime status startedAt').lean(),
    ]);
    const provider = getBuildPreviewProvider();
    const available = await provider.checkAvailability();
    return jsonResponse({
      availability: {
        available,
        reason: available ? null : 'Live browser preview is unavailable. No isolated preview gateway is configured; project containers have no network and no exposed ports.',
      },
      target,
      sessions: sessions.map(session => ({
        id: session._id.toString(),
        executionSessionId: session.executionSessionId.toString(),
        framework: session.framework,
        runtime: session.runtime,
        status: session.status,
        startedAt: session.startedAt,
        stoppedAt: session.stoppedAt ?? null,
        lastError: session.lastError ?? null,
      })),
      executionSessions: executionSessions.map(session => ({ id: session._id.toString(), runtime: session.runtime, startedAt: session.startedAt })),
    });
  } catch (error) {
    console.error('BUILD preview status could not be loaded.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'Preview status could not be loaded.' }, 503);
  }
}

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'preview-action', 20);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const parsed = previewActionSchema.safeParse(await parseJsonBody(request, 4 * 1024));
  if (!mongoose.isValidObjectId(projectId) || !parsed.success) return jsonResponse({ error: 'The preview action is invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId, status: 'active' })) return jsonResponse({ error: 'Project not found or is archived.' }, 404);

  if (parsed.data.action === 'start' || parsed.data.action === 'restart') {
    const session = await BuildExecutionSession.findOne({
      _id: parsed.data.sessionId, ownerId, projectId, status: 'active', busy: false,
    }).select('_id sourceSnapshot');
    if (!session) return jsonResponse({ error: 'An active execution session owned by this user and project is required.' }, 409);
    if (parsed.data.action === 'restart') {
      const currentPreview = await BuildPreviewSession.findOne({
        _id: parsed.data.previewId, ownerId, projectId, executionSessionId: session._id,
      }).select('_id');
      if (!currentPreview) return jsonResponse({ error: 'Preview session not found for this execution session.' }, 404);
    }
    const currentFiles = await BuildProjectFile.find({ ownerId, projectId }).select('path fileId revision').lean();
    const sourceSnapshot = new Map(session.sourceSnapshot.map(file => [file.path, `${file.fileId.toString()}:${file.revision}`]));
    if (currentFiles.length !== sourceSnapshot.size || currentFiles.some(file =>
      sourceSnapshot.get(file.path) !== `${file.fileId.toString()}:${file.revision}`,
    )) {
      return jsonResponse({ error: 'The execution session does not match the latest saved project version. Save editor changes, synchronize explicitly if needed, and start a fresh execution session before previewing.' }, 409);
    }
    const { target } = await detectProjectTarget(projectId, ownerId);
    if (target.status !== 'detected') return jsonResponse({ error: target.explanation }, 422);
  }
  if (parsed.data.action === 'restart' || parsed.data.action === 'stop' || parsed.data.action === 'reload') {
    const previewId = parsed.data.previewId;
    if (!await BuildPreviewSession.exists({ _id: previewId, ownerId, projectId })) {
      return jsonResponse({ error: 'Preview session not found.' }, 404);
    }
  }

  const provider = getBuildPreviewProvider();
  if (!await provider.checkAvailability()) {
    return jsonResponse({
      error: 'Live preview is unavailable. Configure and deploy a dedicated owner-authenticated preview gateway before starting browser workloads.',
    }, 503);
  }
  return jsonResponse({ error: 'The configured preview provider does not implement this operation.' }, 503);
}
