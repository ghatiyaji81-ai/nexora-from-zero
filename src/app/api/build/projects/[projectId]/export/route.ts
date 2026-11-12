import mongoose from 'mongoose';
import { requireBuild } from '@/lib/server/build';
import { readBuildFile } from '@/lib/server/build-files';
import { jsonResponse } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const MAX_EXPORT_BYTES = 10 * 1024 * 1024;

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'project-export', 10);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const project = await BuildProject.findOne({ _id: projectId, ownerId }).select('-ownerId').lean();
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  const files = await BuildProjectFile.find({ ownerId, projectId }).sort({ path: 1 }).limit(501).select('path fileId size').lean();
  if (files.length > 500 || files.reduce((sum, file) => sum + file.size, 0) > MAX_EXPORT_BYTES) return jsonResponse({ error: 'This project exceeds the 10 MB export limit.' }, 413);
  const exportedFiles = [];
  for (const file of files) {
    const content = await readBuildFile(file.fileId, ownerId, new mongoose.Types.ObjectId(projectId));
    if (content === null) return jsonResponse({ error: `File content is unavailable: ${file.path}` }, 503);
    exportedFiles.push({ path: file.path, content });
  }
  const body = JSON.stringify({ format: 'nexora-build-project-v1', exportedAt: new Date().toISOString(), project: { title: project.title, description: project.description, template: project.template, tags: project.tags }, files: exportedFiles }, null, 2);
  if (Buffer.byteLength(body, 'utf8') > MAX_EXPORT_BYTES) return jsonResponse({ error: 'This project exceeds the 10 MB export limit.' }, 413);
  const safeName = project.title.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'build-project';
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}.nexora-build.json"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
