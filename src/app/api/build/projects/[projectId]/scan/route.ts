import mongoose from 'mongoose';
import { scanBuildFiles } from '@/lib/build';
import { requireBuild } from '@/lib/server/build';
import { readBuildFile } from '@/lib/server/build-files';
import { jsonResponse } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildProjectFile } from '@/models/build-project-file';
import { BuildSecurityScan } from '@/models/build-security-scan';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
const MAX_SCAN_FILES = 200;

export async function POST(request: Request, route: Context) {
  const gate = await requireBuild(request, 'static-scan', 12);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  if (!await BuildProject.exists({ _id: projectObjectId, ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  const candidates = await BuildProjectFile.find({ ownerId, projectId: projectObjectId }).sort({ path: 1 }).limit(MAX_SCAN_FILES + 1).select('fileId path size').lean();
  const files: Array<{ path: string; content: string }> = [];
  let scannedBytes = 0;
  let truncated = candidates.length > MAX_SCAN_FILES;
  for (const candidate of candidates.slice(0, MAX_SCAN_FILES)) {
    if (scannedBytes + candidate.size > MAX_SCAN_BYTES) { truncated = true; break; }
    const content = await readBuildFile(candidate.fileId, ownerId, projectObjectId);
    if (content === null) return jsonResponse({ error: `File content could not be read: ${candidate.path}` }, 503);
    scannedBytes += candidate.size;
    files.push({ path: candidate.path, content });
  }
  const findings = scanBuildFiles(files);
  const scan = await BuildSecurityScan.create({
    ownerId, projectId: projectObjectId, findings, scannedFileCount: files.length, truncated,
  });
  return jsonResponse({
    scan: { id: scan._id.toString(), findings, scannedFileCount: files.length, truncated, createdAt: scan.createdAt },
    notice: 'Heuristic static-analysis suggestions only; findings are unverified and a clean scan does not establish that the project is secure.',
  }, 201);
}
