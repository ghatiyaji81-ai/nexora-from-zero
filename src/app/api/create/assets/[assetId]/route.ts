import mongoose from 'mongoose';
import { z } from 'zod';
import { requireCreate } from '@/lib/server/create';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { CreateAsset } from '@/models/create-asset';
import { CreateProject } from '@/models/create-project';

export const runtime = 'nodejs';
type Context = { params: Promise<{ assetId: string }> };
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  folder: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
  favorite: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0);

export async function PATCH(request: Request, route: Context) {
  const gate = await requireCreate(request, 'asset-update');
  if ('response' in gate) return gate.response;
  const { assetId } = await route.params;
  const parsed = updateSchema.safeParse(await parseJsonBody(request));
  if (!mongoose.isValidObjectId(assetId) || !parsed.success) return jsonResponse({ error: 'The asset update is invalid.' }, 400);
  const asset = await CreateAsset.findOne({ _id: assetId, ownerId: gate.ownerId });
  if (!asset) return jsonResponse({ error: 'Asset not found.' }, 404);
  if (parsed.data.name !== undefined) asset.name = parsed.data.name;
  if (parsed.data.folder !== undefined) asset.folder = parsed.data.folder;
  if (parsed.data.tags !== undefined) asset.tags = [...new Set(parsed.data.tags)];
  if (parsed.data.favorite !== undefined) asset.favorite = parsed.data.favorite;
  await asset.save();
  return jsonResponse({ asset: { id: asset._id.toString(), name: asset.name, folder: asset.folder, tags: asset.tags, favorite: asset.favorite, updatedAt: asset.updatedAt } });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireCreate(request, 'asset-delete', 30);
  if ('response' in gate) return gate.response;
  const { assetId } = await route.params;
  if (!mongoose.isValidObjectId(assetId)) return jsonResponse({ error: 'Asset not found.' }, 404);
  const asset = await CreateAsset.findOne({ _id: assetId, ownerId: gate.ownerId });
  if (!asset) return jsonResponse({ error: 'Asset not found.' }, 404);
  const database = mongoose.connection.db;
  if (!database) return jsonResponse({ error: 'Private asset storage is unavailable.' }, 503);
  try {
    await new mongoose.mongo.GridFSBucket(database, { bucketName: 'create_assets' }).delete(asset.fileId);
  } catch (error) {
    console.error('CREATE asset deletion failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The private file could not be deleted. Please retry.' }, 503);
  }
  await CreateAsset.deleteOne({ _id: asset._id, ownerId: gate.ownerId });
  if (asset.projectId) await CreateProject.updateOne({ _id: asset.projectId, ownerId: gate.ownerId }, { $pull: { assetIds: asset._id } });
  if (asset.projectId) {
    const project = await CreateProject.findOne({ _id: asset.projectId, ownerId: gate.ownerId, thumbnailAssetId: asset._id }).select('_id').lean();
    if (project) {
      const nextImage = await CreateAsset.findOne({ ownerId: gate.ownerId, projectId: asset.projectId, kind: 'image', _id: { $ne: asset._id } }).sort({ createdAt: -1 }).select('_id').lean();
      await CreateProject.updateOne(
        { _id: project._id, ownerId: gate.ownerId, thumbnailAssetId: asset._id },
        nextImage ? { $set: { thumbnailAssetId: nextImage._id } } : { $unset: { thumbnailAssetId: 1 } },
      );
    }
  }
  return jsonResponse({ success: true });
}
