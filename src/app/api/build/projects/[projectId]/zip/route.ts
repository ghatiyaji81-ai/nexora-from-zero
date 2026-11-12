import mongoose from 'mongoose';
import { writeBuildZip } from '@/lib/build-archive';
import { requireBuild } from '@/lib/server/build';
import { readBuildFile } from '@/lib/server/build-files';
import { jsonResponse } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const MAX_EXPORT_BYTES = 10 * 1024 * 1024;

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'project-zip-export', 10);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const project = await BuildProject.findOne({ _id: projectId, ownerId }).select('title').lean();
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  const records = await BuildProjectFile.find({ ownerId, projectId }).sort({ path: 1 }).limit(501).select('path fileId size').lean();
  if (!records.length) return jsonResponse({ error: 'The project contains no files to export.' }, 409);
  if (records.length > 500 || records.reduce((sum, record) => sum + record.size, 0) > MAX_EXPORT_BYTES) {
    return jsonResponse({ error: 'This project exceeds the 10 MB ZIP export limit.' }, 413);
  }
  const files = [];
  for (const record of records) {
    const content = await readBuildFile(record.fileId, ownerId, new mongoose.Types.ObjectId(projectId));
    if (content === null) return jsonResponse({ error: `File content is unavailable: ${record.path}` }, 503);
    files.push({ path: record.path, content });
  }
  const zip = writeBuildZip(files);
  const safeName = project.title.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'build-project';
  return new Response(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"`,
      'Content-Length': String(zip.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
