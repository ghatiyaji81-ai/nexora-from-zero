import mongoose from 'mongoose';
import { z } from 'zod';
import { detectBuildRuntime, MAX_BUILD_COMMAND_TIMEOUT_MS, parseBuildCommand } from '@/lib/build-execution-policy';
import { BuildExecutionTimeoutError, BuildExecutionUnavailableError, clipBuildOutput, getBuildExecutionProvider } from '@/lib/server/build-execution-provider';
import { requireBuild } from '@/lib/server/build';
import { readBuildFile } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildExecutionLog } from '@/models/build-execution-log';
import { BuildExecutionSession } from '@/models/build-execution-session';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';
import { BuildProjectFileVersion } from '@/models/build-project-file-version';
import { deleteBuildBlob, MAX_BUILD_FILE_BYTES, retainBuildFileVersion, storeBuildFile } from '@/lib/server/build-files';
import { safeBuildPath } from '@/lib/build';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const commandSchema = z.object({
  action: z.literal('run'),
  sessionId: z.string().regex(/^[a-f\d]{24}$/i),
  command: z.string().trim().min(1).max(300),
  approved: z.literal(true),
  timeoutMs: z.number().int().min(1000).max(MAX_BUILD_COMMAND_TIMEOUT_MS).optional(),
}).strict();
const stopSchema = z.object({ action: z.literal('stop'), sessionId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
const startSchema = z.object({ action: z.literal('start') }).strict();
const syncSchema = z.object({ action: z.literal('sync'), sessionId: z.string().regex(/^[a-f\d]{24}$/i), approved: z.literal(true) }).strict();

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'execution-history');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  const sessions = await BuildExecutionSession.find({ ownerId, projectId }).sort({ createdAt: -1 }).limit(10)
    .select('runtime status busy startedAt stoppedAt createdAt').lean();
  const logs = await BuildExecutionLog.find({ ownerId, projectId }).sort({ createdAt: -1 }).limit(50)
    .select('sessionId kind command stdout stderr exitCode durationMs createdAt').lean();
  return jsonResponse({
    sessions: sessions.map(session => ({ id: session._id.toString(), runtime: session.runtime, status: session.status, busy: session.busy, startedAt: session.startedAt, stoppedAt: session.stoppedAt })),
    logs: logs.map(log => ({ ...log, id: log._id.toString(), sessionId: log.sessionId.toString() })),
  });
}

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'execution-action', 20);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const raw = await parseJsonBody(request, 8 * 1024);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const project = await BuildProject.findOne({ _id: projectId, ownerId, status: 'active' }).select('_id').lean();
  if (!project) return jsonResponse({ error: 'Project not found or is archived.' }, 404);
  const provider = getBuildExecutionProvider();

  const start = startSchema.safeParse(raw);
  if (start.success) {
    if (!await provider.checkAvailability()) {
      return jsonResponse({ error: 'Execution environment unavailable. Enable BUILD_DOCKER_ENABLED and install the configured sandbox image locally.' }, 503);
    }
    if (await BuildExecutionSession.countDocuments({ ownerId, projectId, status: { $in: ['starting', 'active'] } }) >= 3) {
      return jsonResponse({ error: 'A project can have at most three active isolated sessions.' }, 409);
    }
    const records = await BuildProjectFile.find({ ownerId, projectId }).sort({ path: 1 }).limit(501).select('path fileId size revision').lean();
    if (!records.length || records.length > 500 || records.some(file => !safeBuildPath(file.path)) || records.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) {
      return jsonResponse({ error: 'The project is empty or exceeds isolated workspace limits.' }, 413);
    }
    const files = [];
    for (const record of records) {
      const content = await readBuildFile(record.fileId, ownerId, new mongoose.Types.ObjectId(projectId));
      if (content === null) return jsonResponse({ error: `Project file is unavailable: ${record.path}` }, 503);
      files.push({ path: record.path, content });
    }
    const runtime = detectBuildRuntime(files.map(file => file.path));
    const sessionId = new mongoose.Types.ObjectId();
    const containerId = `nexora-build-${sessionId.toString()}`;
    const session = await BuildExecutionSession.create({
      _id: sessionId, ownerId, projectId, runtime, containerId,
      status: 'starting', busy: false, startedAt: new Date(),
      sourceSnapshot: records.map(file => ({ path: file.path, fileId: file.fileId, revision: file.revision })),
    });
    try {
      await provider.start(sessionId.toString(), runtime, files);
      const activeSession = await BuildExecutionSession.findOneAndUpdate(
        { _id: sessionId, ownerId, projectId, status: 'starting' },
        { $set: { status: 'active' } }, { new: true },
      );
      if (!activeSession) {
        await provider.remove(containerId);
        return jsonResponse({ error: 'The session was stopped before startup completed.' }, 409);
      }
      return jsonResponse({ session: { id: activeSession._id.toString(), runtime, status: activeSession.status, startedAt: activeSession.startedAt } }, 201);
    } catch (error) {
      try {
        await provider.remove(containerId);
        await BuildExecutionSession.updateOne(
          { _id: sessionId, ownerId, projectId, status: 'starting' },
          { $set: { status: 'failed', stoppedAt: new Date() } },
        );
      } catch (cleanupError) {
        console.error('BUILD isolated session cleanup failed after startup error.', { sessionId: session._id.toString(), errorName: cleanupError instanceof Error ? cleanupError.name : 'UnknownError' });
      }
      if (error instanceof BuildExecutionUnavailableError) return jsonResponse({ error: error.message }, 503);
      console.error('BUILD isolated session could not be created.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
      return jsonResponse({ error: 'The isolated session could not be started.' }, 503);
    }
  }

  const stop = stopSchema.safeParse(raw);
  if (stop.success) {
    const session = await BuildExecutionSession.findOne({ _id: stop.data.sessionId, ownerId, projectId });
    if (!session) return jsonResponse({ error: 'Execution session not found.' }, 404);
    if (session.status !== 'stopped') {
      try {
        await provider.remove(session.containerId);
      } catch (error) {
        console.error('BUILD isolated session cleanup failed.', { sessionId: session._id.toString(), errorName: error instanceof Error ? error.name : 'UnknownError' });
        return jsonResponse({ error: 'Docker could not clean up the isolated session. It remains recorded for retry.' }, 503);
      }
      session.status = 'stopped';
      session.busy = false;
      session.stoppedAt = new Date();
      await session.save();
    }
    return jsonResponse({ session: { id: session._id.toString(), status: session.status } });
  }

  const sync = syncSchema.safeParse(raw);
  if (sync.success) {
    const session = await BuildExecutionSession.findOneAndUpdate(
      { _id: sync.data.sessionId, ownerId, projectId, status: 'active', busy: false },
      { $set: { busy: true } }, { new: true },
    );
    if (!session) return jsonResponse({ error: 'Execution session is unavailable, busy, or belongs to another project.' }, 409);
    try {
      const workspaceFiles = await provider.exportWorkspace(session.containerId);
      if (workspaceFiles.length > 500 || workspaceFiles.some(file => Buffer.byteLength(file.content, 'utf8') > MAX_BUILD_FILE_BYTES)) {
        return jsonResponse({ error: 'The isolated workspace exceeds BUILD file limits.' }, 413);
      }
      const snapshot = new Map(session.sourceSnapshot.map(file => [file.path, { fileId: file.fileId.toString(), revision: file.revision }]));
      const current = await BuildProjectFile.find({ ownerId, projectId }).sort({ path: 1 }).select('path fileId size revision').lean();
      const currentByPath = new Map(current.map(file => [file.path, file]));
      const exportedPaths = new Set(workspaceFiles.map(file => file.path.toLowerCase()));
      const conflicts = current.filter(file => {
        const old = snapshot.get(file.path);
        return !old || old.fileId !== file.fileId.toString() || old.revision !== file.revision;
      }).map(file => file.path);
      for (const old of session.sourceSnapshot) {
        if (!currentByPath.has(old.path)) conflicts.push(old.path);
      }
      if (conflicts.length) {
        return jsonResponse({ error: 'Project files changed in the editor after this session started. Reload or start a fresh session before syncing.', conflicts: [...new Set(conflicts)].slice(0, 30) }, 409);
      }
      if (exportedPaths.size !== workspaceFiles.length) return jsonResponse({ error: 'The isolated workspace contains duplicate case-insensitive file paths.' }, 400);
      const changed = [];
      for (const file of workspaceFiles) {
        const existing = currentByPath.get(file.path);
        if (!existing) { changed.push({ ...file, existing: null }); continue; }
        const oldContent = await readBuildFile(existing.fileId, ownerId, new mongoose.Types.ObjectId(projectId));
        if (oldContent === null) return jsonResponse({ error: `Project file is unavailable: ${file.path}` }, 503);
        if (oldContent !== file.content) changed.push({ ...file, existing });
      }
      const removed = current.filter(file => !exportedPaths.has(file.path.toLowerCase()));
      const stagedBlobIds: mongoose.Types.ObjectId[] = [];
      const committedBlobIds = new Set<string>();
      try {
        for (const file of changed) {
          if (file.existing) await retainBuildFileVersion({
            ownerId, projectId: new mongoose.Types.ObjectId(projectId), fileId: file.existing.fileId,
            path: file.path, size: file.existing.size, revision: file.existing.revision,
          });
          const stored = await storeBuildFile(ownerId, new mongoose.Types.ObjectId(projectId), file.path, file.content);
          stagedBlobIds.push(stored.fileId);
          if (file.existing) {
            const updated = await BuildProjectFile.updateOne(
              { _id: file.existing._id, ownerId, projectId, fileId: file.existing.fileId, revision: file.existing.revision },
              { $set: { fileId: stored.fileId, size: stored.size, revision: file.existing.revision + 1 } },
            );
            if (updated.modifiedCount !== 1) throw new Error(`Concurrent file update detected for ${file.path}.`);
            committedBlobIds.add(stored.fileId.toString());
          } else {
            const previous = await BuildProjectFileVersion.findOne({ ownerId, projectId, path: file.path }).sort({ revision: -1 }).select('revision').lean();
            await BuildProjectFile.create({ ownerId, projectId, path: file.path, fileId: stored.fileId, size: stored.size, revision: (previous?.revision ?? -1) + 1 });
            committedBlobIds.add(stored.fileId.toString());
          }
        }
        for (const file of removed) {
          await retainBuildFileVersion({
            ownerId, projectId: new mongoose.Types.ObjectId(projectId), fileId: file.fileId,
            path: file.path, size: file.size, revision: file.revision,
          });
          const deleted = await BuildProjectFile.deleteOne({ _id: file._id, ownerId, projectId, fileId: file.fileId, revision: file.revision });
          if (deleted.deletedCount !== 1) throw new Error(`Concurrent file update detected for ${file.path}.`);
        }
      } catch (error) {
        await Promise.all(stagedBlobIds.filter(fileId => !committedBlobIds.has(fileId.toString())).map(fileId => deleteBuildBlob(fileId).catch(() => undefined)));
        console.error('BUILD isolated workspace synchronization was incomplete.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
        return jsonResponse({ error: 'Workspace synchronization failed and may be partial. Refresh the project before retrying.' }, 503);
      }
      const updatedFiles = await BuildProjectFile.find({ ownerId, projectId }).sort({ path: 1 }).select('path fileId revision').lean();
      session.sourceSnapshot = updatedFiles.map(file => ({ path: file.path, fileId: file.fileId, revision: file.revision }));
      session.busy = false;
      await Promise.all([
        session.save(),
        BuildProject.updateOne({ _id: projectId, ownerId }, { $set: { updatedAt: new Date() } }),
      ]);
      return jsonResponse({ synchronized: changed.length + removed.length, files: updatedFiles.length });
    } catch (error) {
      await BuildExecutionSession.updateOne({ _id: session._id, ownerId }, { $set: { busy: false } });
      if (error instanceof BuildExecutionUnavailableError) return jsonResponse({ error: error.message }, 503);
      console.error('BUILD workspace synchronization failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
      return jsonResponse({ error: 'The isolated workspace could not be synchronized.' }, 503);
    } finally {
      await BuildExecutionSession.updateOne({ _id: session._id, ownerId, busy: true }, { $set: { busy: false } });
    }
  }

  const command = commandSchema.safeParse(raw);
  if (!command.success) return jsonResponse({ error: 'Provide a supported command, an owned session, and explicit run approval.' }, 400);
  const policy = parseBuildCommand(command.data.command);
  if (!policy) return jsonResponse({ error: 'That command is not in BUILD’s restricted command policy. Shell operators, arbitrary programs, and network operations are not allowed.' }, 400);
  const session = await BuildExecutionSession.findOneAndUpdate(
    { _id: command.data.sessionId, ownerId, projectId, status: 'active', busy: false },
    { $set: { busy: true } }, { new: true },
  );
  if (!session) return jsonResponse({ error: 'Execution session is unavailable, busy, or belongs to another project.' }, 409);
  const startedAt = Date.now();
  try {
    const result = await provider.run(session.containerId, policy.args, command.data.timeoutMs ?? 120000);
    const log = await BuildExecutionLog.create({
      ownerId, projectId, sessionId: session._id, kind: 'command', command: command.data.command,
      stdout: clipBuildOutput(result.stdout), stderr: clipBuildOutput(result.stderr),
      exitCode: result.exitCode, durationMs: result.durationMs,
    });
    await BuildExecutionSession.updateOne({ _id: session._id, ownerId }, { $set: { busy: false } });
    return jsonResponse({ result: { ...result, logId: log._id.toString() } });
  } catch (error) {
    const timedOut = error instanceof BuildExecutionTimeoutError;
    await BuildExecutionLog.create({
      ownerId, projectId, sessionId: session._id, kind: 'command', command: command.data.command,
      stdout: '', stderr: error instanceof Error ? error.message : 'The isolated command failed.',
      exitCode: timedOut ? 124 : -1, durationMs: Date.now() - startedAt,
    });
    await BuildExecutionSession.updateOne(
      { _id: session._id, ownerId },
      timedOut ? { $set: { busy: false, status: 'stopped', stoppedAt: new Date() } } : { $set: { busy: false } },
    );
    if (error instanceof BuildExecutionUnavailableError) return jsonResponse({ error: error.message }, 503);
    if (timedOut) return jsonResponse({ error: error.message }, 504);
    console.error('BUILD isolated command failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The isolated command could not be completed.' }, 503);
  }
}
