import mongoose from 'mongoose';
import { z } from 'zod';
import { requireCreate } from '@/lib/server/create';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { CreateExport } from '@/models/create-export';
import { CreateProject } from '@/models/create-project';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const exportSchema = z.object({ format: z.enum(['png', 'svg', 'jpeg', 'webp', 'pdf', 'md', 'txt', 'html', 'webm', 'mp3', 'wav']) }).strict();

export async function GET(request: Request, route: Context) {
  const gate = await requireCreate(request, 'export-history');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  if (!await CreateProject.exists({ _id: projectId, ownerId: gate.ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  const exports = await CreateExport.find({ ownerId: gate.ownerId, projectId }).sort({ createdAt: -1 }).limit(50).select('-ownerId').lean();
  return jsonResponse({ exports: exports.map(item => ({ id: item._id.toString(), projectId: item.projectId.toString(), projectTitle: item.projectTitle, format: item.format, createdAt: item.createdAt })) });
}

export async function POST(request: Request, route: Context) {
  const gate = await requireCreate(request, 'export-record', 60);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const parsed = exportSchema.safeParse(await parseJsonBody(request));
  if (!mongoose.isValidObjectId(projectId) || !parsed.success) return jsonResponse({ error: 'The export record is invalid.' }, 400);
  const project = await CreateProject.findOne({ _id: projectId, ownerId: gate.ownerId }).select('title').lean();
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  const record = await CreateExport.create({ ownerId: gate.ownerId, projectId: project._id, projectTitle: project.title, format: parsed.data.format });
  return jsonResponse({ export: { id: record._id.toString(), projectId, projectTitle: record.projectTitle, format: record.format, createdAt: record.createdAt } }, 201);
}
