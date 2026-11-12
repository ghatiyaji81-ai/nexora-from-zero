import mongoose from 'mongoose';
import { z } from 'zod';
import { safeBuildPath } from '@/lib/build';
import { isValidBuildBranch } from '@/lib/build-execution-policy';
import { BuildExecutionUnavailableError, getBuildExecutionProvider } from '@/lib/server/build-execution-provider';
import { requireBuild } from '@/lib/server/build';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildExecutionLog } from '@/models/build-execution-log';
import { BuildExecutionSession } from '@/models/build-execution-session';
import { BuildGitRepository } from '@/models/build-git-repository';
import { BuildProject } from '@/models/build-project';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const operationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('init'), sessionId: z.string().regex(/^[a-f\d]{24}$/i) }).strict(),
  z.object({ action: z.literal('status'), sessionId: z.string().regex(/^[a-f\d]{24}$/i) }).strict(),
  z.object({ action: z.literal('diff'), sessionId: z.string().regex(/^[a-f\d]{24}$/i), path: z.string().max(240).optional(), cached: z.boolean().optional() }).strict(),
  z.object({ action: z.literal('stage'), sessionId: z.string().regex(/^[a-f\d]{24}$/i), path: z.string().min(1).max(240) }).strict(),
  z.object({ action: z.literal('unstage'), sessionId: z.string().regex(/^[a-f\d]{24}$/i), path: z.string().min(1).max(240) }).strict(),
  z.object({ action: z.literal('commit'), sessionId: z.string().regex(/^[a-f\d]{24}$/i), message: z.string().trim().min(1).max(500), authorName: z.string().trim().min(1).max(100), authorEmail: z.string().email().max(200) }).strict(),
  z.object({ action: z.literal('history'), sessionId: z.string().regex(/^[a-f\d]{24}$/i) }).strict(),
  z.object({ action: z.literal('branches'), sessionId: z.string().regex(/^[a-f\d]{24}$/i) }).strict(),
  z.object({ action: z.literal('create-branch'), sessionId: z.string().regex(/^[a-f\d]{24}$/i), branch: z.string().min(1).max(120) }).strict(),
  z.object({ action: z.literal('switch-branch'), sessionId: z.string().regex(/^[a-f\d]{24}$/i), branch: z.string().min(1).max(120) }).strict(),
  z.object({ action: z.literal('compare'), sessionId: z.string().regex(/^[a-f\d]{24}$/i), base: z.string().min(1).max(120), compare: z.string().min(1).max(120) }).strict(),
  z.object({ action: z.literal('restore'), sessionId: z.string().regex(/^[a-f\d]{24}$/i), commit: z.string().regex(/^[a-f\d]{7,40}$/i), path: z.string().min(1).max(240), approved: z.literal(true) }).strict(),
]);

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'git-operation', 45);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const parsed = operationSchema.safeParse(await parseJsonBody(request, 8 * 1024));
  if (!mongoose.isValidObjectId(projectId) || !parsed.success) return jsonResponse({ error: 'The Git operation is invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId, status: 'active' })) return jsonResponse({ error: 'Project not found or is archived.' }, 404);
  const session = await BuildExecutionSession.findOne({
    _id: parsed.data.sessionId, ownerId, projectId, status: 'active', busy: false,
  });
  if (!session) return jsonResponse({ error: 'Start an available isolated execution session before using Git.' }, 409);
  const provider = getBuildExecutionProvider();
  if (!await provider.checkAvailability()) return jsonResponse({ error: 'The isolated Docker provider is unavailable.' }, 503);
  const repository = await BuildGitRepository.findOne({ ownerId, projectId, sessionId: session._id });
  const { action } = parsed.data;
  if (action !== 'init' && !repository?.initialized) return jsonResponse({ error: 'Initialize Git in this isolated session first.' }, 409);

  let args: string[];
  switch (action) {
    case 'init':
      args = ['git', 'init', '--initial-branch=main'];
      break;
    case 'status':
      args = ['git', 'status', '--porcelain=v1', '-b'];
      break;
    case 'diff': {
      const filePath = parsed.data.path ? safeBuildPath(parsed.data.path) : undefined;
      if (parsed.data.path && !filePath) return jsonResponse({ error: 'The diff path is unsafe.' }, 400);
      args = ['git', 'diff', '--no-ext-diff', '--no-color', ...(parsed.data.cached ? ['--cached'] : []), ...(filePath ? ['--', filePath] : [])];
      break;
    }
    case 'stage': {
      const filePath = safeBuildPath(parsed.data.path);
      if (!filePath) return jsonResponse({ error: 'The stage path is unsafe.' }, 400);
      args = ['git', 'add', '--', filePath];
      break;
    }
    case 'unstage': {
      const filePath = safeBuildPath(parsed.data.path);
      if (!filePath) return jsonResponse({ error: 'The unstage path is unsafe.' }, 400);
      args = ['git', 'restore', '--staged', '--', filePath];
      break;
    }
    case 'commit':
      args = ['-c', `user.name=${parsed.data.authorName}`, '-c', `user.email=${parsed.data.authorEmail}`, 'commit', '-m', parsed.data.message];
      args.unshift('git');
      break;
    case 'history':
      args = ['git', 'log', '--format=%H%x09%h%x09%an%x09%aI%x09%s', '--max-count=30'];
      break;
    case 'branches':
      args = ['git', 'branch', '--list'];
      break;
    case 'create-branch':
      if (!isValidBuildBranch(parsed.data.branch)) return jsonResponse({ error: 'The branch name is invalid.' }, 400);
      args = ['git', 'switch', '-c', parsed.data.branch];
      break;
    case 'switch-branch':
      if (!isValidBuildBranch(parsed.data.branch)) return jsonResponse({ error: 'The branch name is invalid.' }, 400);
      args = ['git', 'switch', parsed.data.branch];
      break;
    case 'compare':
      if (!isValidBuildBranch(parsed.data.base) || !isValidBuildBranch(parsed.data.compare)) return jsonResponse({ error: 'A comparison branch name is invalid.' }, 400);
      args = ['git', 'diff', '--no-ext-diff', '--no-color', `${parsed.data.base}...${parsed.data.compare}`];
      break;
    case 'restore': {
      if (!parsed.data.approved) return jsonResponse({ error: 'Restoring a previous file requires explicit confirmation.' }, 403);
      const filePath = safeBuildPath(parsed.data.path);
      if (!filePath) return jsonResponse({ error: 'The restore path is unsafe.' }, 400);
      args = ['git', 'checkout', parsed.data.commit, '--', filePath];
      break;
    }
  }

  const locked = await BuildExecutionSession.findOneAndUpdate(
    { _id: session._id, ownerId, projectId, status: 'active', busy: false }, { $set: { busy: true } }, { new: true },
  );
  if (!locked) return jsonResponse({ error: 'The execution session is busy.' }, 409);
  const startedAt = Date.now();
  try {
    const result = await provider.run(session.containerId, args, 30_000);
    const log = await BuildExecutionLog.create({
      ownerId, projectId, sessionId: session._id, kind: 'git',
      command: `Git ${action}${action === 'commit' ? `: ${parsed.data.message.slice(0, 180)}` : ''}`,
      stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, durationMs: result.durationMs,
    });
    if (action === 'init' && result.exitCode === 0) {
      await BuildGitRepository.updateOne(
        { ownerId, projectId, sessionId: session._id },
        { $set: { initialized: true, defaultBranch: 'main' }, $setOnInsert: { ownerId, projectId, sessionId: session._id } },
        { upsert: true },
      );
    }
    await BuildExecutionSession.updateOne({ _id: session._id, ownerId }, { $set: { busy: false } });
    return jsonResponse({ result: { ...result, logId: log._id.toString() } });
  } catch (error) {
    await BuildExecutionSession.updateOne({ _id: session._id, ownerId }, { $set: { busy: false } });
    if (error instanceof BuildExecutionUnavailableError) return jsonResponse({ error: error.message }, 503);
    console.error('BUILD Git operation failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The Git operation could not be completed.' }, 503);
  }
}
