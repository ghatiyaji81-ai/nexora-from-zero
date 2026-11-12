import mongoose from 'mongoose';
import { z } from 'zod';
import { BuildArchiveError, MAX_BUILD_ARCHIVE_BYTES, readBuildZip } from '@/lib/build-archive';
import { requireBuild } from '@/lib/server/build';
import { deleteBuildBlob, storeBuildFile } from '@/lib/server/build-files';
import { jsonResponse } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';

export const runtime = 'nodejs';
const titleSchema = z.string().trim().min(1).max(120);

export async function POST(request: Request) {
  const gate = await requireBuild(request, 'project-import', 5);
  if ('response' in gate) return gate.response;
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/zip' && contentType !== 'application/x-zip-compressed') {
    return jsonResponse({ error: 'Import a ZIP archive. Project code is stored only; it is never executed.' }, 415);
  }
  const title = titleSchema.safeParse(new URL(request.url).searchParams.get('title') ?? '');
  if (!title.success) return jsonResponse({ error: 'Provide a project title up to 120 characters.' }, 400);
  const archive = await readRequestBytes(request, MAX_BUILD_ARCHIVE_BYTES);
  if (!archive) return jsonResponse({ error: 'The ZIP file is empty or exceeds the 10 MB upload limit.' }, 413);

  let files;
  try {
    files = readBuildZip(archive);
  } catch (error) {
    if (error instanceof BuildArchiveError) return jsonResponse({ error: error.message }, 400);
    throw error;
  }

  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const project = await BuildProject.create({
    ownerId,
    title: title.data,
    description: 'Imported from a ZIP archive. Review files before using them in any external environment.',
    template: 'blank',
  });
  const createdBlobs: mongoose.Types.ObjectId[] = [];
  try {
    for (const file of files) {
      const stored = await storeBuildFile(ownerId, project._id, file.path, file.content);
      createdBlobs.push(stored.fileId);
      await BuildProjectFile.create({ ownerId, projectId: project._id, path: file.path, fileId: stored.fileId, size: stored.size });
    }
    return jsonResponse({
      project: { id: project._id.toString(), title: project.title, template: project.template, status: project.status },
      importedFiles: files.length,
      executed: false,
    }, 201);
  } catch (error) {
    await BuildProjectFile.deleteMany({ ownerId, projectId: project._id });
    await Promise.all(createdBlobs.map(fileId => deleteBuildBlob(fileId).catch(() => undefined)));
    await project.deleteOne();
    console.error('BUILD ZIP import failed while storing project files.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The project could not be stored. Please retry the import.' }, 503);
  }
}

async function readRequestBytes(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch (error) {
    throw new Error('The ZIP upload could not be read.', { cause: error });
  }
  if (!size) return null;
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size);
}
