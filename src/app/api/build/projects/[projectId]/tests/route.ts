import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { buildTestCommand, detectBuildTestTarget, parseBuildTestOutput, type BuildTestTarget } from '@/lib/build-testing';
import { MAX_BUILD_COMMAND_TIMEOUT_MS } from '@/lib/build-execution-policy';
import { BuildExecutionTimeoutError, BuildExecutionUnavailableError, clipBuildOutput, getBuildExecutionProvider } from '@/lib/server/build-execution-provider';
import { requireBuild } from '@/lib/server/build';
import { readBuildFile } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildExecutionSession } from '@/models/build-execution-session';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';
import { BuildTestRun } from '@/models/build-test-run';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const testActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('run'),
    sessionId: z.string().regex(/^[a-f\d]{24}$/i),
    approved: z.literal(true),
    selection: z.string().max(240).optional(),
    timeoutMs: z.number().int().min(1000).max(MAX_BUILD_COMMAND_TIMEOUT_MS).optional(),
  }).strict(),
  z.object({ action: z.literal('cancel'), runId: z.string().regex(/^[a-f\d]{24}$/i) }).strict(),
]);

async function loadTarget(projectId: string, ownerId: mongoose.Types.ObjectId) {
  const records = await BuildProjectFile.find({ ownerId, projectId }).sort({ path: 1 }).limit(501)
    .select('path fileId size revision').lean();
  if (records.length > 500) throw new Error('The project exceeds the supported file count for test discovery.');
  const contentFiles = records.filter(file =>
    /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|pipfile|pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|vitest\.config\.[^/]+|jest\.config\.[^/]+|playwright\.config\.[^/]+|cypress\.config\.[^/]+|pytest\.ini|tox\.ini)$/i.test(file.path),
  );
  const files = [];
  for (const record of records) {
    let content: string | undefined;
    if (contentFiles.some(candidate => candidate.path === record.path)) {
      content = await readBuildFile(record.fileId, ownerId, new mongoose.Types.ObjectId(projectId)) ?? undefined;
      if (content === undefined) throw new Error(`Project file is unavailable: ${record.path}`);
    }
    files.push({ path: record.path, content, size: record.size });
  }
  return { records, target: detectBuildTestTarget(files) };
}

function serializedRun(run: {
  _id: mongoose.Types.ObjectId;
  executionSessionId: mongoose.Types.ObjectId;
  framework: string;
  command: string;
  selection?: string;
  status: string;
  exitCode?: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
  counts: { total?: number; passed?: number; failed?: number; skipped?: number };
  failures: Array<{ name: string; message: string }>;
  startedAt: Date;
  finishedAt?: Date;
}) {
  return {
    id: run._id.toString(), sessionId: run.executionSessionId.toString(),
    framework: run.framework, command: run.command, selection: run.selection ?? null,
    status: run.status, exitCode: run.exitCode ?? null,
    stdout: run.stdout, stderr: run.stderr, durationMs: run.durationMs ?? null,
    counts: run.counts, failures: run.failures,
    startedAt: run.startedAt, finishedAt: run.finishedAt ?? null,
  };
}

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'test-discovery');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  try {
    const [{ target }, sessions, runs, provider] = await Promise.all([
      loadTarget(projectId, ownerId),
      BuildExecutionSession.find({ ownerId, projectId, status: 'active', busy: false }).sort({ startedAt: -1 }).limit(3)
        .select('runtime status startedAt').lean(),
      BuildTestRun.find({ ownerId, projectId }).sort({ createdAt: -1 }).limit(30)
        .select('executionSessionId framework command selection status exitCode stdout stderr durationMs counts failures startedAt finishedAt').lean(),
      Promise.resolve(getBuildExecutionProvider()),
    ]);
    const available = await provider.checkAvailability();
    return jsonResponse({
      discovery: target,
      provider: { available, reason: available ? null : 'Isolated test execution is unavailable until the Docker provider and required runtime image are configured.' },
      sessions: sessions.map(session => ({ id: session._id.toString(), runtime: session.runtime, startedAt: session.startedAt })),
      runs: runs.map(run => serializedRun({ ...run, _id: run._id, counts: run.counts ?? {}, failures: run.failures ?? [] })),
      note: 'A framework declaration or config file is discovery evidence only. Test counts are shown only when parsed from actual test runner output.',
    });
  } catch (error) {
    console.error('BUILD test discovery failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: error instanceof Error ? error.message : 'Test discovery failed.' }, 503);
  }
}

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'test-action', 20);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const parsed = testActionSchema.safeParse(await parseJsonBody(request, 4 * 1024));
  if (!mongoose.isValidObjectId(projectId) || !parsed.success) return jsonResponse({ error: 'The test action is invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId, status: 'active' })) return jsonResponse({ error: 'Project not found or is archived.' }, 404);
  const provider = getBuildExecutionProvider();

  if (parsed.data.action === 'cancel') {
    const run = await BuildTestRun.findOne({ _id: parsed.data.runId, ownerId, projectId, status: 'running' });
    if (!run) return jsonResponse({ error: 'Running test attempt not found.' }, 404);
    const session = await BuildExecutionSession.findOne({
      _id: run.executionSessionId, ownerId, projectId, status: 'active',
    });
    if (!session) return jsonResponse({ error: 'The isolated execution session is no longer active.' }, 409);
    try {
      await provider.remove(session.containerId);
      const cancelled = await BuildTestRun.findOneAndUpdate(
        { _id: run._id, ownerId, projectId, status: 'running' },
        { $set: { status: 'cancelled', finishedAt: new Date(), durationMs: Math.max(0, Date.now() - run.startedAt.getTime()), exitCode: 130, stderr: 'Cancelled by the project owner; the isolated session was stopped.' } },
        { new: true },
      );
      session.status = 'stopped';
      session.busy = false;
      session.stoppedAt = new Date();
      await session.save();
      if (!cancelled) return jsonResponse({ error: 'The test run completed before cancellation could be recorded; its isolated session was stopped.' }, 409);
      return jsonResponse({ run: serializedRun(cancelled) });
    } catch (error) {
      console.error('BUILD test cancellation cleanup failed.', { runId: run._id.toString(), errorName: error instanceof Error ? error.name : 'UnknownError' });
      return jsonResponse({ error: 'The isolated test process could not be safely stopped.' }, 503);
    }
  }

  if (!await provider.checkAvailability()) return jsonResponse({ error: 'The isolated execution provider is unavailable.' }, 503);
  let target: BuildTestTarget;
  try {
    ({ target } = await loadTarget(projectId, ownerId));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Test discovery failed.' }, 503);
  }
  const args = buildTestCommand(target, parsed.data.selection);
  if (!args || target.unavailableReason) return jsonResponse({ error: target.unavailableReason ?? 'No safe command is available for this test selection.' }, 422);
  const command = args.join(' ');
  const session = await BuildExecutionSession.findOneAndUpdate(
    { _id: parsed.data.sessionId, ownerId, projectId, status: 'active', busy: false, runtime: target.runtime },
    { $set: { busy: true } }, { new: true },
  );
  if (!session) return jsonResponse({ error: 'Choose an idle active execution session with the detected project runtime.' }, 409);

  let run;
  try {
    run = await BuildTestRun.create({
      ownerId, projectId, executionSessionId: session._id, framework: target.framework,
      command, selection: parsed.data.selection, status: 'running', stdout: '', stderr: '',
      counts: {}, failures: [], startedAt: new Date(),
    });
  } catch (error) {
    await BuildExecutionSession.updateOne({ _id: session._id, ownerId, busy: true }, { $set: { busy: false } });
    console.error('BUILD test attempt could not be recorded.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The test run could not be recorded, so no command was started.' }, 503);
  }
  try {
    const excessRuns = await BuildTestRun.find({ ownerId, projectId, status: { $ne: 'running' } })
      .sort({ createdAt: -1 }).skip(50).select('_id').lean();
    if (excessRuns.length) await BuildTestRun.deleteMany({ _id: { $in: excessRuns.map(item => item._id) }, ownerId, projectId, status: { $ne: 'running' } });
  } catch (error) {
    console.error('BUILD test history retention cleanup failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
  }
  const startedAt = Date.now();
  try {
    const result = await provider.run(session.containerId, args, parsed.data.timeoutMs ?? 120_000, request.signal);
    const stdout = clipBuildOutput(result.stdout);
    const stderr = clipBuildOutput(result.stderr);
    const counts = parseBuildTestOutput(target.framework, `${stdout}\n${stderr}`);
    const status = result.exitCode === 0 ? 'passed' : 'failed';
    const updated = await BuildTestRun.findOneAndUpdate(
      { _id: run._id, ownerId, status: 'running' },
      { $set: { status, exitCode: result.exitCode, stdout, stderr, durationMs: result.durationMs, counts, failures: counts.failures, finishedAt: new Date() } },
      { new: true },
    );
    if (!updated) return jsonResponse({ error: 'The test attempt was cancelled before its results could be recorded.' }, 409);
    await BuildExecutionSession.updateOne({ _id: session._id, ownerId, status: 'active' }, { $set: { busy: false } });
    return jsonResponse({ run: serializedRun(updated) });
  } catch (error) {
    const timedOut = error instanceof BuildExecutionTimeoutError;
    const cancelled = request.signal.aborted;
    const stdout = '';
    const stderr = clipBuildOutput(error instanceof Error ? error.message : 'The isolated test command failed.');
    const status = timedOut ? 'timed_out' : cancelled ? 'cancelled' : error instanceof BuildExecutionUnavailableError ? 'unavailable' : 'failed';
    const exitCode = timedOut ? 124 : cancelled ? 130 : -1;
    const counts = parseBuildTestOutput(target.framework, `${stdout}\n${stderr}`);
    const updated = await BuildTestRun.findOneAndUpdate(
      { _id: run._id, ownerId, status: 'running' },
      { $set: { status, exitCode, stdout, stderr, durationMs: Date.now() - startedAt, counts, failures: counts.failures, finishedAt: new Date() } },
      { new: true },
    );
    await BuildExecutionSession.updateOne(
      { _id: session._id, ownerId },
      timedOut || cancelled ? { $set: { busy: false, status: 'stopped', stoppedAt: new Date() } } : { $set: { busy: false } },
    );
    if (error instanceof BuildExecutionUnavailableError) return jsonResponse({ error: error.message, run: updated ? serializedRun(updated) : null }, 503);
    if (timedOut) return jsonResponse({ error: error.message, run: updated ? serializedRun(updated) : null }, 504);
    if (cancelled) return jsonResponse({ error: 'The test request was cancelled and its isolated command stopped.', run: updated ? serializedRun(updated) : null }, 499);
    console.error('BUILD isolated test command failed.', { runId: run._id.toString(), errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The isolated test command failed.', run: updated ? serializedRun(updated) : null }, 503);
  } finally {
    await BuildExecutionSession.updateOne({ _id: session._id, ownerId, status: 'active', busy: true }, { $set: { busy: false } });
  }
}
