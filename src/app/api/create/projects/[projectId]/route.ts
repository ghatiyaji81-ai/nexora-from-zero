import mongoose from 'mongoose';
import { z } from 'zod';
import { requireCreate } from '@/lib/server/create';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { CreateAsset } from '@/models/create-asset';
import { CreateExport } from '@/models/create-export';
import { CreateProject } from '@/models/create-project';
import { CreateProjectVersion } from '@/models/create-project-version';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  favorite: z.boolean().optional(),
  status: z.enum(['draft', 'archived']).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  revision: z.number().int().min(0).optional(),
}).strict().refine(value => Object.keys(value).some(key => key !== 'revision'), 'An editable project field is required.');

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
  data: Record<string, unknown>;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: project._id.toString(), title: project.title, description: project.description,
    category: project.category, projectType: project.projectType, status: project.status,
    favorite: project.favorite, assetIds: project.assetIds.map(id => id.toString()),
    thumbnailUrl: project.thumbnailAssetId ? `/api/create/assets/${project.thumbnailAssetId.toString()}/file` : null,
    data: project.data, revision: project.revision, createdAt: project.createdAt, updatedAt: project.updatedAt,
  };
}

export async function GET(request: Request, route: Context) {
  const gate = await requireCreate(request, 'project-read');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const project = await CreateProject.findOne({ _id: projectId, ownerId: gate.ownerId }).lean();
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  return jsonResponse({ project: publicProject(project) });
}

export async function PATCH(request: Request, route: Context) {
  const gate = await requireCreate(request, 'project-update', 180);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const parsed = updateSchema.safeParse(await parseJsonBody(request, 180 * 1024));
  if (!mongoose.isValidObjectId(projectId) || !parsed.success) return jsonResponse({ error: 'The project update is invalid.' }, 400);
  if (parsed.data.data && JSON.stringify(parsed.data.data).length > 150_000) {
    return jsonResponse({ error: 'Project content must be smaller than 150 KB.' }, 413);
  }
  const project = await CreateProject.findOne({ _id: projectId, ownerId: gate.ownerId });
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  if (parsed.data.revision !== undefined && parsed.data.revision !== project.revision) {
    return jsonResponse({ error: 'This project changed in another editor. Reload it before saving again.' }, 409);
  }
  const hasDataChange = parsed.data.data !== undefined && JSON.stringify(parsed.data.data) !== JSON.stringify(project.data);
  let version: InstanceType<typeof CreateProjectVersion> | null = null;
  if (hasDataChange) {
    version = await CreateProjectVersion.create({
      ownerId: gate.ownerId, projectId: project._id, revision: project.revision,
      title: project.title, data: project.data,
    });
  }
  if (parsed.data.title !== undefined) project.title = parsed.data.title;
  if (parsed.data.description !== undefined) project.description = parsed.data.description;
  if (parsed.data.favorite !== undefined) project.favorite = parsed.data.favorite;
  if (parsed.data.status !== undefined) project.status = parsed.data.status;
  if (parsed.data.data !== undefined) project.data = parsed.data.data;
  project.revision += 1;
  try {
    await project.save();
  } catch (error) {
    if (version) await version.deleteOne();
    throw error;
  }
  if (hasDataChange) {
    const excess = await CreateProjectVersion.find({ ownerId: gate.ownerId, projectId }).sort({ revision: -1 }).skip(30).select('_id').lean();
    if (excess.length) await CreateProjectVersion.deleteMany({ _id: { $in: excess.map(item => item._id) }, ownerId: gate.ownerId });
  }
  return jsonResponse({ project: publicProject(project) });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireCreate(request, 'project-delete', 30);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const project = await CreateProject.findOneAndDelete({ _id: projectId, ownerId: gate.ownerId });
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  await Promise.all([
    CreateProjectVersion.deleteMany({ ownerId: gate.ownerId, projectId: project._id }),
    CreateExport.deleteMany({ ownerId: gate.ownerId, projectId: project._id }),
    CreateAsset.updateMany({ ownerId: gate.ownerId, projectId: project._id }, { $unset: { projectId: 1 } }),
  ]);
  return jsonResponse({ success: true });
}
