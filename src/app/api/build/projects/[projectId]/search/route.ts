import mongoose from 'mongoose';
import { requireBuild } from '@/lib/server/build';
import { readBuildFile } from '@/lib/server/build-files';
import { jsonResponse } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const MAX_SEARCH_BYTES = 2 * 1024 * 1024;
const MAX_SEARCH_FILES = 200;

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'project-search');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100);
  if (!mongoose.isValidObjectId(projectId) || !query) return jsonResponse({ error: 'Enter a search term.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  if (!await BuildProject.exists({ _id: projectObjectId, ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  const files = await BuildProjectFile.find({ ownerId, projectId: projectObjectId }).sort({ path: 1 }).limit(MAX_SEARCH_FILES + 1).select('fileId path size').lean();
  const results: Array<{ fileId: string; path: string; line: number; preview: string }> = [];
  let bytes = 0;
  let truncated = files.length > MAX_SEARCH_FILES;
  const needle = query.toLowerCase();
  for (const file of files.slice(0, MAX_SEARCH_FILES)) {
    if (bytes + file.size > MAX_SEARCH_BYTES) { truncated = true; break; }
    const content = await readBuildFile(file.fileId, ownerId, projectObjectId);
    if (content === null) return jsonResponse({ error: `File content could not be read: ${file.path}` }, 503);
    bytes += file.size;
    content.split(/\r?\n/).forEach((line, index) => {
      if (line.toLowerCase().includes(needle) && results.length < 200) results.push({ fileId: file._id.toString(), path: file.path, line: index + 1, preview: line.trim().slice(0, 240) });
    });
  }
  return jsonResponse({ results, truncated, searchedFiles: Math.min(files.length, MAX_SEARCH_FILES) });
}
