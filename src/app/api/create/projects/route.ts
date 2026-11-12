import mongoose from 'mongoose';
import { z } from 'zod';
import { CREATE_CATEGORIES, createInitialData, projectTypeForCategory } from '@/lib/create';
import { requireCreate } from '@/lib/server/create';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { CreateProject } from '@/models/create-project';

export const runtime = 'nodejs';
const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  category: z.enum(CREATE_CATEGORIES),
  projectType: z.enum(['image', 'video', 'design', 'document', 'presentation', 'content', 'audio', 'custom']).optional(),
  width: z.number().int().min(64).max(4000).optional(),
  height: z.number().int().min(64).max(4000).optional(),
  duplicateId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
}).strict();

function publicProject(project: {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  category: string;
  projectType: string;
  status: string;
  favorite: boolean;
  thumbnailAssetId?: mongoose.Types.ObjectId;
  assetIds: mongoose.Types.ObjectId[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: project._id.toString(), title: project.title, description: project.description,
    category: project.category, projectType: project.projectType, status: project.status,
    favorite: project.favorite, assetCount: project.assetIds.length, revision: project.revision,
    thumbnailUrl: project.thumbnailAssetId ? `/api/create/assets/${project.thumbnailAssetId.toString()}/file` : null,
    createdAt: project.createdAt, updatedAt: project.updatedAt,
  };
}

export async function GET(request: Request) {
  const gate = await requireCreate(request, 'project-list');
  if ('response' in gate) return gate.response;
  const params = new URL(request.url).searchParams;
  const filter: Record<string, unknown> = { ownerId: gate.ownerId };
  const category = params.get('category');
  const status = params.get('status');
  const query = params.get('q')?.trim().slice(0, 80);
  if (category && CREATE_CATEGORIES.includes(category as (typeof CREATE_CATEGORIES)[number])) filter.category = category;
  if (status === 'archived') filter.status = 'archived';
  else filter.status = 'draft';
  if (params.get('favorite') === '1') filter.favorite = true;
  if (query) filter.$text = { $search: query };
  const projects = await CreateProject.find(filter).sort(query ? { score: { $meta: 'textScore' } } : { updatedAt: -1 }).limit(100).select('-ownerId -data').lean();
  return jsonResponse({ projects: projects.map(publicProject) });
}

export async function POST(request: Request) {
  const gate = await requireCreate(request, 'project-create', 40);
  if ('response' in gate) return gate.response;
  const parsed = createSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return jsonResponse({ error: 'Enter a project title and choose a valid category.' }, 400);
  const projectType = parsed.data.projectType ?? projectTypeForCategory(parsed.data.category);
  const duplicated = parsed.data.duplicateId
    ? await CreateProject.findOne({ _id: parsed.data.duplicateId, ownerId: gate.ownerId, status: 'draft' }).lean()
    : null;
  if (parsed.data.duplicateId && !duplicated) return jsonResponse({ error: 'Project not found.' }, 404);
  const project = await CreateProject.create({
    ownerId: gate.ownerId,
    title: parsed.data.title,
    description: parsed.data.description ?? duplicated?.description ?? '',
    category: parsed.data.category,
    projectType,
    favorite: false,
    data: duplicated?.data ?? createInitialData(projectType, parsed.data.width, parsed.data.height),
  });
  return jsonResponse({ project: publicProject(project) }, 201);
}
