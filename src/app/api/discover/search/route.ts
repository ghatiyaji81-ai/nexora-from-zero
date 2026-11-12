import mongoose from 'mongoose';
import { z } from 'zod';
import { escapeDiscoverSearchTerm, findDocumentExcerpt, validateDiscoverQuery } from '@/lib/discover';
import { requireDiscover } from '@/lib/server/discover';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { DiscoverSearch } from '@/models/discover-search';
import { ThinkDocument } from '@/models/think-document';

export const runtime = 'nodejs';
const searchSchema = z.object({
  query: z.string().trim().min(2).max(240),
  exactPhrase: z.boolean().default(true),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.enum(['relevance', 'recent']).default('relevance'),
}).strict();

export async function GET(request: Request) {
  const gate = await requireDiscover(request, 'search-history');
  if ('response' in gate) return gate.response;
  const searches = await DiscoverSearch.find({ ownerId: gate.ownerId }).sort({ createdAt: -1 }).limit(30).select('-ownerId').lean();
  return jsonResponse({ searches: searches.map(search => ({ id: search._id.toString(), query: search.query, exactPhrase: search.exactPhrase, resultCount: search.resultCount, createdAt: search.createdAt })) });
}

export async function POST(request: Request) {
  const gate = await requireDiscover(request, 'local-search', 30);
  if ('response' in gate) return gate.response;
  const parsed = searchSchema.safeParse(await parseJsonBody(request, 8 * 1024));
  if (!parsed.success || !validateDiscoverQuery(parsed.data.query)) return jsonResponse({ error: 'Enter a search phrase between 2 and 240 characters.' }, 400);
  const terms = parsed.data.query.split(/\s+/).filter(Boolean).slice(0, 8);
  const conditions: Record<string, unknown>[] = parsed.data.exactPhrase
    ? [{ extractedText: { $regex: escapeDiscoverSearchTerm(parsed.data.query), $options: 'i' } }]
    : terms.map(term => ({ extractedText: { $regex: escapeDiscoverSearchTerm(term), $options: 'i' } }));
  const createdAt: Record<string, Date> = {};
  if (parsed.data.from) createdAt.$gte = new Date(parsed.data.from);
  if (parsed.data.to) createdAt.$lte = new Date(parsed.data.to);
  if (createdAt.$gte && createdAt.$lte && createdAt.$gte > createdAt.$lte) return jsonResponse({ error: 'The date range is invalid.' }, 400);
  const documents = await ThinkDocument.find({
    ownerId: gate.ownerId,
    ...(conditions.length ? { $and: conditions } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  }).sort({ createdAt: -1 }).limit(30)
    .select('+extractedText name mimeType createdAt').lean();
  const hits = documents.flatMap(document => {
    const text = document.extractedText;
    if (!text) return [];
    const lower = text.toLocaleLowerCase();
    if (!parsed.data.exactPhrase && !terms.every(term => lower.includes(term.toLocaleLowerCase()))) return [];
    const excerptQuery = parsed.data.exactPhrase ? parsed.data.query : terms[0];
    const result = findDocumentExcerpt(text, excerptQuery);
    if (!result) return [];
    let score = 0;
    if (parsed.data.sort === 'relevance') {
      const escaped = new RegExp(escapeDiscoverSearchTerm(parsed.data.exactPhrase ? parsed.data.query : excerptQuery), 'gi');
      score = [...text.matchAll(escaped)].length;
    }
    return [{
      documentId: document._id.toString(),
      title: document.name,
      mimeType: document.mimeType,
      createdAt: document.createdAt,
      excerpt: result.excerpt,
      start: result.start,
      end: result.end,
      ...(parsed.data.sort === 'relevance' ? { score } : {}),
    }];
  });
  if (parsed.data.sort === 'relevance') hits.sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const results = hits.slice(0, 30).map(({ score: _score, ...hit }) => hit);
  const search = await DiscoverSearch.create({
    ownerId: gate.ownerId,
    query: parsed.data.query,
    exactPhrase: parsed.data.exactPhrase,
    resultCount: results.length,
  });
  return jsonResponse({
    searchId: search._id.toString(),
    results,
    limits: { searchedDocuments: documents.length, resultLimit: 30, searchWindowLimit: 30 },
    notice: 'Results are exact text matches from your private THINK documents; they are not public web results.',
  });
}
