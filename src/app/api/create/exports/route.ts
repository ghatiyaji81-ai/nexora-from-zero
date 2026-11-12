import { requireCreate } from '@/lib/server/create';
import { jsonResponse } from '@/lib/server/http';
import { CreateExport } from '@/models/create-export';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireCreate(request, 'export-list');
  if ('response' in gate) return gate.response;
  const exports = await CreateExport.find({ ownerId: gate.ownerId }).sort({ createdAt: -1 }).limit(50).select('-ownerId').lean();
  return jsonResponse({ exports: exports.map(item => ({ id: item._id.toString(), projectId: item.projectId.toString(), projectTitle: item.projectTitle, format: item.format, createdAt: item.createdAt })) });
}
