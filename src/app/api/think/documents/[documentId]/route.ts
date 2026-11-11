import mongoose from 'mongoose';
import { requireThink } from '@/lib/server/think';
import { jsonResponse } from '@/lib/server/http';
import { ThinkDocument } from '@/models/think-document';
import { ThinkMessage } from '@/models/think-message';

export const runtime = 'nodejs';
type Context = { params: Promise<{ documentId: string }> };

export async function GET(request: Request, route: Context) {
  const gate = await requireThink(request, 'document-read');
  if ('response' in gate) return gate.response;
  const { documentId } = await route.params;
  if (!mongoose.isValidObjectId(documentId)) return jsonResponse({ error: 'Document not found.' }, 404);
  const document = await ThinkDocument.findOne({ _id: documentId, ownerId: gate.context.user.id }).select('+extractedText -ownerId -sha256').lean();
  if (!document) return jsonResponse({ error: 'Document not found.' }, 404);
  return jsonResponse({ document: { id: document._id.toString(), name: document.name, mimeType: document.mimeType, size: document.size, pageCount: document.pageCount, preview: document.extractedText.slice(0, 12000), createdAt: document.createdAt } });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireThink(request, 'document-delete', 30);
  if ('response' in gate) return gate.response;
  const { documentId } = await route.params;
  if (!mongoose.isValidObjectId(documentId)) return jsonResponse({ error: 'Document not found.' }, 404);
  const document = await ThinkDocument.findOneAndDelete({ _id: documentId, ownerId: gate.context.user.id });
  if (!document) return jsonResponse({ error: 'Document not found.' }, 404);
  await Promise.all([
    new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'think_documents' }).delete(document.fileId).catch(() => undefined),
    ThinkMessage.updateMany({ ownerId: document.ownerId, documentIds: document._id }, { $pull: { documentIds: document._id } }),
  ]);
  return jsonResponse({ success: true });
}
