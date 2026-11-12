import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { inspectBuildDependencies } from '@/lib/build-testing';
import { requireBuild } from '@/lib/server/build';
import { deleteBuildBlob, readBuildFile, retainBuildFileVersion, storeBuildFile } from '@/lib/server/build-files';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { BuildDependencyOperation } from '@/models/build-dependency-operation';
import { BuildDependencySnapshot } from '@/models/build-dependency-snapshot';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';
import { BuildProjectFileVersion } from '@/models/build-project-file-version';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const dependencyName = /^(?:@[A-Za-z0-9][A-Za-z0-9._-]{0,39}\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const dependencyActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('snapshot') }).strict(),
  z.object({
    action: z.literal('request'),
    operation: z.enum(['add', 'remove', 'update', 'outdated', 'vulnerability-scan']),
    packageName: z.string().regex(dependencyName).optional(),
    version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.*+!_-]{0,79}$/).optional(),
  }).strict().refine(value =>
    (['add', 'remove', 'update'].includes(value.operation) ? Boolean(value.packageName) : true) &&
    (['add', 'update'].includes(value.operation) ? Boolean(value.version) : true),
  ),
  z.object({ action: z.literal('restore'), snapshotId: z.string().regex(/^[a-f\d]{24}$/i), approved: z.literal(true) }).strict(),
]);
const DEPENDENCY_FILES = /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements\.txt|pyproject\.toml|pipfile|pipfile\.lock|uv\.lock|poetry\.lock|pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?)$/i;
const MAX_SNAPSHOT_FILES = 20;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

async function loadDependencyFiles(projectId: string, ownerId: mongoose.Types.ObjectId) {
  const records = await BuildProjectFile.find({ ownerId, projectId, path: DEPENDENCY_FILES }).sort({ path: 1 }).limit(MAX_SNAPSHOT_FILES + 1)
    .select('path fileId size revision').lean();
  if (records.length > MAX_SNAPSHOT_FILES) throw new Error('The project has too many dependency manifest and lock files to snapshot safely.');
  const files = [];
  for (const record of records) {
    const content = await readBuildFile(record.fileId, ownerId, new mongoose.Types.ObjectId(projectId));
    if (content === null) throw new Error(`Dependency file is unavailable: ${record.path}`);
    files.push({ ...record, content });
  }
  return files;
}

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'dependency-inspection');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  try {
    const [files, snapshots, operations] = await Promise.all([
      loadDependencyFiles(projectId, ownerId),
      BuildDependencySnapshot.find({ ownerId, projectId }).sort({ createdAt: -1 }).limit(10).select('files.path files.revision files.sha256 createdAt').lean(),
      BuildDependencyOperation.find({ ownerId, projectId }).sort({ createdAt: -1 }).limit(20).select('action packageName requestedVersion status reason createdAt').lean(),
    ]);
    return jsonResponse({
      inspection: inspectBuildDependencies(files.map(file => ({ path: file.path, content: file.content, size: file.size }))),
      snapshots: snapshots.map(snapshot => ({
        id: snapshot._id.toString(),
        files: snapshot.files.map(file => ({ path: file.path, revision: file.revision, sha256: file.sha256 })),
        createdAt: snapshot.createdAt,
      })),
      operations: operations.map(operation => ({ id: operation._id.toString(), action: operation.action, packageName: operation.packageName ?? null, version: operation.requestedVersion ?? null, status: operation.status, reason: operation.reason, createdAt: operation.createdAt })),
    });
  } catch (error) {
    console.error('BUILD dependency inspection failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: error instanceof Error ? error.message : 'Dependency information could not be loaded.' }, 503);
  }
}

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'dependency-operation', 20);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const parsed = dependencyActionSchema.safeParse(await parseJsonBody(request, 4 * 1024));
  if (!mongoose.isValidObjectId(projectId) || !parsed.success) return jsonResponse({ error: 'The dependency operation is invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  if (!await BuildProject.exists({ _id: projectObjectId, ownerId, status: 'active' })) return jsonResponse({ error: 'Project not found or is archived.' }, 404);

  if (parsed.data.action === 'request') {
    const reason = parsed.data.operation === 'vulnerability-scan'
      ? 'No trusted vulnerability provider is configured, so no scan was performed.'
      : parsed.data.operation === 'outdated'
        ? 'Registry checks are unavailable because no approved package broker is configured.'
        : 'Dependency operations are unavailable because no approved network/package broker is configured. No project files or packages were changed.';
    const operation = await BuildDependencyOperation.create({
      ownerId, projectId: projectObjectId, action: parsed.data.operation,
      packageName: parsed.data.packageName, requestedVersion: parsed.data.version,
      status: 'blocked', reason,
    });
    const excessOperations = await BuildDependencyOperation.find({ ownerId, projectId: projectObjectId })
      .sort({ createdAt: -1 }).skip(100).select('_id').lean();
    if (excessOperations.length) {
      await BuildDependencyOperation.deleteMany({ _id: { $in: excessOperations.map(item => item._id) }, ownerId, projectId: projectObjectId });
    }
    return jsonResponse({ operation: { id: operation._id.toString(), status: operation.status, reason }, error: reason }, 503);
  }

  let files;
  try {
    files = await loadDependencyFiles(projectId, ownerId);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Dependency files could not be read.' }, 503);
  }
  if (parsed.data.action === 'snapshot') {
    if (!files.length) return jsonResponse({ error: 'No dependency manifest or lockfile exists to snapshot.' }, 409);
    const totalBytes = files.reduce((total, file) => total + Buffer.byteLength(file.content, 'utf8'), 0);
    if (totalBytes > MAX_SNAPSHOT_BYTES) return jsonResponse({ error: 'Dependency files exceed the snapshot size limit.' }, 413);
    const stored: mongoose.Types.ObjectId[] = [];
    try {
      const entries = [];
      for (const file of files) {
        const backup = await storeBuildFile(ownerId, projectObjectId, file.path, file.content, 'build-dependency-snapshot');
        stored.push(backup.fileId);
        entries.push({
          path: file.path, fileId: backup.fileId, revision: file.revision,
          sha256: createHash('sha256').update(file.content, 'utf8').digest('hex'),
        });
      }
      const snapshot = await BuildDependencySnapshot.create({ ownerId, projectId: projectObjectId, files: entries });
      try {
        const excessSnapshots = await BuildDependencySnapshot.find({ ownerId, projectId: projectObjectId })
          .sort({ createdAt: -1 }).skip(20).select('_id files.fileId').lean();
        if (excessSnapshots.length) {
          await BuildDependencySnapshot.deleteMany({ _id: { $in: excessSnapshots.map(item => item._id) }, ownerId, projectId: projectObjectId });
          const obsoleteIds = excessSnapshots.flatMap(item => item.files.map(file => file.fileId));
          await Promise.all(obsoleteIds.map(fileId => deleteBuildBlob(fileId).catch(error => {
            console.error('BUILD old dependency snapshot blob cleanup failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
          })));
        }
      } catch (cleanupError) {
        console.error('BUILD dependency snapshot retention cleanup failed.', { errorName: cleanupError instanceof Error ? cleanupError.name : 'UnknownError' });
      }
      return jsonResponse({
        snapshot: {
          id: snapshot._id.toString(),
          files: entries.map(file => ({ path: file.path, revision: file.revision, sha256: file.sha256 })),
          createdAt: snapshot.createdAt,
          note: 'Private GridFS copies are retained for explicit restore. No manifests have been changed.',
        },
      }, 201);
    } catch (error) {
      await Promise.all(stored.map(fileId => deleteBuildBlob(fileId).catch(() => undefined)));
      console.error('BUILD dependency snapshot could not be stored.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
      return jsonResponse({ error: 'The dependency snapshot could not be stored.' }, 503);
    }
  }

  const snapshot = await BuildDependencySnapshot.findOne({
    _id: parsed.data.snapshotId, ownerId, projectId: projectObjectId,
  });
  if (!snapshot) return jsonResponse({ error: 'Dependency snapshot not found.' }, 404);
  const restored = [];
  for (const saved of snapshot.files) {
    const content = await readBuildFile(saved.fileId, ownerId, projectObjectId);
    if (content === null || createHash('sha256').update(content, 'utf8').digest('hex') !== saved.sha256) {
      return jsonResponse({ error: `Snapshot content failed its integrity check for ${saved.path}.` }, 503);
    }
  }
  for (const saved of snapshot.files) {
    const content = await readBuildFile(saved.fileId, ownerId, projectObjectId);
    if (content === null) return jsonResponse({ error: `Snapshot content is unavailable for ${saved.path}.` }, 503);
    let current = await BuildProjectFile.findOne({ ownerId, projectId: projectObjectId, path: saved.path });
    try {
      const stored = await storeBuildFile(ownerId, projectObjectId, saved.path, content);
      if (current) {
        await retainBuildFileVersion({
          ownerId, projectId: projectObjectId, fileId: current.fileId, path: current.path,
          size: current.size, revision: current.revision,
        });
        const next = await BuildProjectFile.findOneAndUpdate(
          { _id: current._id, ownerId, projectId: projectObjectId, revision: current.revision },
          { $set: { fileId: stored.fileId, size: stored.size }, $inc: { revision: 1 } },
          { new: true },
        ).select('path revision').lean();
        if (!next) {
          await deleteBuildBlob(stored.fileId).catch(() => undefined);
          return jsonResponse({ error: `A concurrent edit prevented restoring ${saved.path}. Earlier files in this restore may already have been applied.` }, 409);
        }
        restored.push({ path: next.path, revision: next.revision });
      } else {
        const latest = await BuildProjectFileVersion.findOne({ ownerId, projectId: projectObjectId, path: saved.path }).sort({ revision: -1 }).select('revision').lean();
        const next = await BuildProjectFile.create({
          ownerId, projectId: projectObjectId, path: saved.path, fileId: stored.fileId,
          size: Buffer.byteLength(content, 'utf8'), revision: (latest?.revision ?? saved.revision) + 1,
        });
        restored.push({ path: next.path, revision: next.revision });
      }
    } catch (error) {
      console.error('BUILD dependency snapshot restore was incomplete.', { path: saved.path, errorName: error instanceof Error ? error.name : 'UnknownError' });
      return jsonResponse({ error: `Dependency restore may be partial at ${saved.path}. Refresh the project before retrying.`, restored }, 503);
    }
  }
  await BuildProject.updateOne({ _id: projectObjectId, ownerId }, { $set: { updatedAt: new Date() } });
  return jsonResponse({ restored, note: 'Only dependency files present in this snapshot were restored. Other project files were not changed.' });
}
