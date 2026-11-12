import mongoose from 'mongoose';
import { z } from 'zod';
import { requireDiscover } from '@/lib/server/discover';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { DiscoverBookmark } from '@/models/discover-bookmark';
import { DiscoverCollection } from '@/models/discover-collection';
import { DiscoverSource } from '@/models/discover-source';
import { ThinkDocument } from '@/models/think-document';

export const runtime = 'nodejs';
const saveSchema = z.object({
  documentId: z.string().regex(/^[a-f\d]{24}$/i),
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  collectionId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  note: z.string().trim().max(1000).optional(),
}).strict();

export async function GET(request: Request) {
  const gate = await requireDiscover(request, 'source-list');
  if ('response' in gate) return gate.response;
  const collectionId = new URL(request.url).searchParams.get('collectionId');
  const filter: Record<string, unknown> = { ownerId: gate.ownerId };
  if (collectionId) {
    if (!mongoose.isValidObjectId(collectionId)) return jsonResponse({ error: 'Collection not found.' }, 404);
    if (!await DiscoverCollection.exists({ _id: collectionId, ownerId: gate.ownerId })) return jsonResponse({ error: 'Collection not found.' }, 404);
    filter.collectionId = new mongoose.Types.ObjectId(collectionId);
  }
  const bookmarks = await DiscoverBookmark.find(filter).sort({ updatedAt: -1 }).limit(100).select('-ownerId').lean();
  const sources = await DiscoverSource.find({ _id: { $in: bookmarks.map(item => item.sourceId) }, ownerId: gate.ownerId }).select('-ownerId').lean();
  const sourceById = new Map(sources.map(source => [source._id.toString(), source]));
  return jsonResponse({ sources: bookmarks.flatMap(bookmark => {
    const source = sourceById.get(bookmark.sourceId.toString());
    if (!source) return [];
    return [{
      id: source._id.toString(), documentId: source.documentId.toString(), title: source.title,
      mimeType: source.mimeType, excerpt: source.excerpt, start: source.start, end: source.end,
      collectionId: bookmark.collectionId?.toString() ?? null, note: bookmark.note, tags: bookmark.tags,
      createdAt: bookmark.createdAt, updatedAt: bookmark.updatedAt,
    }];
  }) });
}

export async function POST(request: Request) {
  const gate = await requireDiscover(request, 'source-save', 40);
  if ('response' in gate) return gate.response;
  const parsed = saveSchema.safeParse(await parseJsonBody(request, 8 * 1024));
  if (!parsed.success || parsed.data.end <= parsed.data.start || parsed.data.end - parsed.data.start > 700) {
    return jsonResponse({ error: 'The selected evidence location is invalid.' }, 400);
  }
  if (parsed.data.collectionId && !await DiscoverCollection.exists({ _id: parsed.data.collectionId, ownerId: gate.ownerId, archived: false })) {
    return jsonResponse({ error: 'Choose an active collection that belongs to you.' }, 404);
  }
  const document = await ThinkDocument.findOne({ _id: parsed.data.documentId, ownerId: gate.ownerId })
    .select('+extractedText name mimeType').lean();
  if (!document || parsed.data.end > document.extractedText.length) return jsonResponse({ error: 'Document or evidence not found.' }, 404);
  const excerpt = document.extractedText.slice(parsed.data.start, parsed.data.end);
  if (!excerpt.trim()) return jsonResponse({ error: 'The selected evidence is empty.' }, 400);
  let source = await DiscoverSource.findOne({
    ownerId: gate.ownerId, documentId: document._id, start: parsed.data.start, end: parsed.data.end,
  });
  if (!source) {
    try {
      source = await DiscoverSource.create({
        ownerId: gate.ownerId, documentId: document._id, title: document.name,
        mimeType: document.mimeType, excerpt, start: parsed.data.start, end: parsed.data.end,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      source = await DiscoverSource.findOne({
        ownerId: gate.ownerId, documentId: document._id, start: parsed.data.start, end: parsed.data.end,
      });
    }
  }
  if (!source) return jsonResponse({ error: 'The evidence could not be saved.' }, 503);
  const bookmark = await DiscoverBookmark.findOneAndUpdate(
    { ownerId: gate.ownerId, sourceId: source._id },
    {
      $set: { ...(parsed.data.collectionId ? { collectionId: new mongoose.Types.ObjectId(parsed.data.collectionId) } : {}), note: parsed.data.note ?? '' },
      $setOnInsert: { ownerId: gate.ownerId, sourceId: source._id, tags: [] },
    },
    { upsert: true, new: true, runValidators: true },
  );
  return jsonResponse({
    source: {
      id: source._id.toString(), documentId: source.documentId.toString(), title: source.title,
      mimeType: source.mimeType, excerpt: source.excerpt, start: source.start, end: source.end,
      collectionId: bookmark.collectionId?.toString() ?? null, note: bookmark.note, tags: bookmark.tags,
      createdAt: bookmark.createdAt, updatedAt: bookmark.updatedAt,
    },
  }, 201);
}

function isDuplicateKey(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
