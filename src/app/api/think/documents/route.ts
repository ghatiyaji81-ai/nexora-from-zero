import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { requireThink } from '@/lib/server/think';
import { jsonResponse } from '@/lib/server/http';
import { extractThinkDocument } from '@/lib/server/think-documents';
import { ThinkDocument } from '@/models/think-document';

export const runtime = 'nodejs';
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, 'application/pdf' | 'text/plain' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'> = {
  pdf: 'application/pdf', txt: 'text/plain', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function GET(request: Request) {
  const gate = await requireThink(request, 'document-list');
  if ('response' in gate) return gate.response;
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const documents = await ThinkDocument.find({ ownerId }).sort({ createdAt: -1 }).limit(100).select('-ownerId -sha256 -extractedText').lean();
  return jsonResponse({ documents: documents.map(document => ({ id: document._id.toString(), name: document.name, mimeType: document.mimeType, size: document.size, pageCount: document.pageCount, createdAt: document.createdAt })) });
}

export async function POST(request: Request) {
  const gate = await requireThink(request, 'document-upload', 12);
  if ('response' in gate) return gate.response;
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length < 1 || length > MAX_DOCUMENT_BYTES + 64 * 1024) return jsonResponse({ error: 'Document size must be 15 MB or less.' }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return jsonResponse({ error: 'Choose a PDF, DOCX, or TXT file.' }, 400);
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType || file.size < 1 || file.size > MAX_DOCUMENT_BYTES) return jsonResponse({ error: 'Only PDF, DOCX, and TXT files up to 15 MB are supported.' }, 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let extracted: ReturnType<typeof extractThinkDocument>;
  try { extracted = extractThinkDocument(bytes, mimeType); }
  catch (error) { return jsonResponse({ error: error instanceof Error ? error.message : 'The document could not be read.' }, 415); }
  const database = mongoose.connection.db;
  if (!database) return jsonResponse({ error: 'Private document storage is unavailable.' }, 503);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const existing = await ThinkDocument.findOne({ ownerId, sha256 }).select('-ownerId -sha256 -extractedText').lean();
  if (existing) return jsonResponse({ document: { id: existing._id.toString(), name: existing.name, mimeType: existing.mimeType, size: existing.size, pageCount: existing.pageCount, createdAt: existing.createdAt } }, 200);
  const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'think_documents' });
  const name = file.name.replace(/[\r\n"\\/\x00-\x1f]/g, '_').trim().slice(0, 160) || `document.${extension}`;
  const upload = bucket.openUploadStream(name, { metadata: { ownerId, contentType: mimeType, sha256, private: true } });
  try {
    await new Promise<void>((resolve, reject) => {
      upload.once('error', reject);
      upload.once('finish', resolve);
      Readable.from(Buffer.from(bytes)).pipe(upload);
    });
    const document = await ThinkDocument.create({ ownerId, fileId: upload.id, name, mimeType, size: file.size, sha256, extractedText: extracted.text, pageCount: extracted.pageCount });
    return jsonResponse({ document: { id: document._id.toString(), name: document.name, mimeType: document.mimeType, size: document.size, pageCount: document.pageCount, createdAt: document.createdAt } }, 201);
  } catch {
    await bucket.delete(upload.id).catch(() => undefined);
    return jsonResponse({ error: 'The document could not be stored. Please retry.' }, 503);
  }
}
