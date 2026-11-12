import mongoose from 'mongoose';
import { z } from 'zod';
import { requireDiscover } from '@/lib/server/discover';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { DiscoverBookmark } from '@/models/discover-bookmark';
import { DiscoverCollection } from '@/models/discover-collection';
import { DiscoverEvidence } from '@/models/discover-evidence';
import { DiscoverSource } from '@/models/discover-source';

export const runtime = 'nodejs';
type Context = { params: Promise<{ sourceId: string }> };
const updateSchema = z.object({
  collectionId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  note: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
}).strict().refine(value => Object.keys(value).length > 0);

export async function PATCH(request: Request, route: Context) {
  const gate = await requireDiscover(request, 'source-update');
  if ('response' in gate) return gate.response;
  const { sourceId } = await route.params;
  const parsed = updateSchema.safeParse(await parseJsonBody(request));
  if (!mongoose.isValidObjectId(sourceId) || !parsed.success) return jsonResponse({ error: 'The source update is invalid.' }, 400);
  if (!await DiscoverSource.exists({ _id: sourceId, ownerId: gate.ownerId })) return jsonResponse({ error: 'Source not found.' }, 404);
  if (parsed.data.collectionId && !await DiscoverCollection.exists({ _id: parsed.data.collectionId, ownerId: gate.ownerId, archived: false })) {
    return jsonResponse({ error: 'Choose an active collection that belongs to you.' }, 404);
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.note !== undefined) updates.note = parsed.data.note;
  if (parsed.data.tags !== undefined) updates.tags = [...new Set(parsed.data.tags)];
  if (parsed.data.collectionId) updates.collectionId = new mongoose.Types.ObjectId(parsed.data.collectionId);
  else if (parsed.data.collectionId === null) updates.$unset = { collectionId: 1 };
  const bookmark = await DiscoverBookmark.findOneAndUpdate(
    { ownerId: gate.ownerId, sourceId },
    { ...(Object.keys(updates).some(key => key !== '$unset') ? { $set: Object.fromEntries(Object.entries(updates).filter(([key]) => key !== '$unset')) } : {}), ...(updates.$unset ? { $unset: updates.$unset } : {}) },
    { new: true, runValidators: true },
  ).select('-ownerId').lean();
  if (!bookmark) return jsonResponse({ error: 'Saved source not found.' }, 404);
  return jsonResponse({ bookmark: { id: bookmark._id.toString(), collectionId: bookmark.collectionId?.toString() ?? null, note: bookmark.note, tags: bookmark.tags, updatedAt: bookmark.updatedAt } });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireDiscover(request, 'source-delete');
  if ('response' in gate) return gate.response;
  const { sourceId } = await route.params;
  if (!mongoose.isValidObjectId(sourceId)) return jsonResponse({ error: 'Source not found.' }, 404);
  const bookmark = await DiscoverBookmark.findOneAndDelete({ ownerId: gate.ownerId, sourceId });
  if (!bookmark) return jsonResponse({ error: 'Saved source not found.' }, 404);
  if (!await DiscoverEvidence.exists({ ownerId: gate.ownerId, sourceId: bookmark.sourceId })) {
    await DiscoverSource.deleteOne({ _id: bookmark.sourceId, ownerId: gate.ownerId });
  }
  return jsonResponse({ success: true });
}
