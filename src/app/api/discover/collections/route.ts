import { z } from 'zod';
import { requireDiscover } from '@/lib/server/discover';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { DiscoverBookmark } from '@/models/discover-bookmark';
import { DiscoverCollection } from '@/models/discover-collection';

export const runtime = 'nodejs';
const createSchema = z.object({ title: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional() }).strict();

export async function GET(request: Request) {
  const gate = await requireDiscover(request, 'collection-list');
  if ('response' in gate) return gate.response;
  const collections = await DiscoverCollection.find({ ownerId: gate.ownerId }).sort({ archived: 1, updatedAt: -1 }).limit(100).select('-ownerId').lean();
  const counts = await DiscoverBookmark.aggregate<{ _id: unknown; count: number }>([
    { $match: { ownerId: gate.ownerId } },
    { $group: { _id: '$collectionId', count: { $sum: 1 } } },
  ]);
  const countById = new Map(counts.map(item => [String(item._id ?? ''), item.count]));
  return jsonResponse({ collections: collections.map(collection => ({
    id: collection._id.toString(), title: collection.title, description: collection.description,
    archived: collection.archived, sourceCount: countById.get(collection._id.toString()) ?? 0,
    createdAt: collection.createdAt, updatedAt: collection.updatedAt,
  })) });
}

export async function POST(request: Request) {
  const gate = await requireDiscover(request, 'collection-create', 30);
  if ('response' in gate) return gate.response;
  const parsed = createSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return jsonResponse({ error: 'Enter a collection title up to 100 characters.' }, 400);
  try {
    const collection = await DiscoverCollection.create({ ownerId: gate.ownerId, title: parsed.data.title, description: parsed.data.description ?? '' });
    return jsonResponse({ collection: { id: collection._id.toString(), title: collection.title, description: collection.description, archived: collection.archived, sourceCount: 0, createdAt: collection.createdAt, updatedAt: collection.updatedAt } }, 201);
  } catch (error) {
    if (isDuplicateKey(error)) return jsonResponse({ error: 'A collection with that title already exists.' }, 409);
    throw error;
  }
}

function isDuplicateKey(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
