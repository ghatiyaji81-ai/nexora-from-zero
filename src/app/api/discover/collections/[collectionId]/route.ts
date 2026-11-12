import mongoose from 'mongoose';
import { z } from 'zod';
import { requireDiscover } from '@/lib/server/discover';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { DiscoverBookmark } from '@/models/discover-bookmark';
import { DiscoverCollection } from '@/models/discover-collection';

export const runtime = 'nodejs';
type Context = { params: Promise<{ collectionId: string }> };
const updateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  archived: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0);

export async function PATCH(request: Request, route: Context) {
  const gate = await requireDiscover(request, 'collection-update');
  if ('response' in gate) return gate.response;
  const { collectionId } = await route.params;
  const parsed = updateSchema.safeParse(await parseJsonBody(request));
  if (!mongoose.isValidObjectId(collectionId) || !parsed.success) return jsonResponse({ error: 'The collection update is invalid.' }, 400);
  try {
    const collection = await DiscoverCollection.findOneAndUpdate({ _id: collectionId, ownerId: gate.ownerId }, { $set: parsed.data }, { new: true, runValidators: true }).select('-ownerId').lean();
    if (!collection) return jsonResponse({ error: 'Collection not found.' }, 404);
    return jsonResponse({ collection: { id: collection._id.toString(), title: collection.title, description: collection.description, archived: collection.archived, updatedAt: collection.updatedAt } });
  } catch (error) {
    if (isDuplicateKey(error)) return jsonResponse({ error: 'A collection with that title already exists.' }, 409);
    throw error;
  }
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireDiscover(request, 'collection-delete');
  if ('response' in gate) return gate.response;
  const { collectionId } = await route.params;
  if (!mongoose.isValidObjectId(collectionId)) return jsonResponse({ error: 'Collection not found.' }, 404);
  const collection = await DiscoverCollection.findOneAndDelete({ _id: collectionId, ownerId: gate.ownerId });
  if (!collection) return jsonResponse({ error: 'Collection not found.' }, 404);
  await DiscoverBookmark.updateMany({ ownerId: gate.ownerId, collectionId: collection._id }, { $unset: { collectionId: 1 } });
  return jsonResponse({ success: true });
}

function isDuplicateKey(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
