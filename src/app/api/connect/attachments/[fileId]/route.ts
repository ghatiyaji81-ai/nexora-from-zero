import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { connectContext, memberConversation, requireConnect } from '@/lib/server/connect';
import { jsonResponse } from '@/lib/server/http';
import { Message } from '@/models/message';
import { Conversation } from '@/models/conversation';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const context = await connectContext();
  if (!context) return jsonResponse({ error: 'Sign in to use Connect.' }, 401);
  const { fileId } = await route.params;
  if (!mongoose.isValidObjectId(fileId)) return jsonResponse({ error: 'Attachment not found.' }, 404);
  const database = mongoose.connection.db;
  if (!database) return jsonResponse({ error: 'File storage is unavailable.' }, 503);
  const id = new mongoose.Types.ObjectId(fileId);
  const file = await database.collection('connect_attachments.files').findOne({ _id: id, 'metadata.verified': true });
  if (!file) return jsonResponse({ error: 'Attachment not found.' }, 404);
  const conversationId = file.metadata?.conversationId;
  if (!(conversationId instanceof mongoose.Types.ObjectId)) return jsonResponse({ error: 'Attachment not found.' }, 404);
  const conversation = await memberConversation(context.user.id, conversationId.toString());
  if (!conversation) return jsonResponse({ error: 'Attachment not found.' }, 404);
  const userId = new mongoose.Types.ObjectId(context.user.id);
  const visibleMessage = await Message.exists({ conversationId, 'attachments.fileId': id, deletedForEveryoneAt: { $exists: false }, deletedFor: { $ne: userId } });
  const activeConversation = await Conversation.exists({ _id: conversationId, avatarFileId: id });
  if (!visibleMessage && !activeConversation) return jsonResponse({ error: 'Attachment not found.' }, 404);
  const total = Number(file.length);
  const type = String(file.metadata?.contentType ?? 'application/octet-stream');
  const fileName = String(file.metadata?.originalName ?? 'attachment').replace(/[\r\n"\\]/g, '_');
  const fallbackName = fileName.replace(/[^\x20-\x7e]/g, '_');
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const range = request.headers.get('range');
  let start = 0;
  let end = total;
  let status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, total - suffix);
    } else start = Number(match[1]);
    end = match[2] && match[1] ? Math.min(total, Number(match[2]) + 1) : total;
    if (start >= total || end <= start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    status = 206;
  }
  const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'connect_attachments' });
  const nodeStream = bucket.openDownloadStream(id, status === 206 ? { start, end } : undefined);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  const headers = new Headers({
    'Content-Type': type,
    'Content-Length': String(end - start),
    'Content-Disposition': `${type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/') ? 'inline' : 'attachment'}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    'Cache-Control': 'private, no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  });
  if (status === 206) headers.set('Content-Range', `bytes ${start}-${end - 1}/${total}`);
  return new Response(webStream, { status, headers });
}

export async function DELETE(request: Request, route: RouteContext) {
  const gate = await requireConnect(request, 'attachment-delete', 30);
  if ('response' in gate) return gate.response;
  const { fileId } = await route.params;
  if (!mongoose.isValidObjectId(fileId)) return jsonResponse({ error: 'Attachment not found.' }, 404);
  const database = mongoose.connection.db;
  if (!database) return jsonResponse({ error: 'File storage is unavailable.' }, 503);
  const id = new mongoose.Types.ObjectId(fileId);
  const file = await database.collection('connect_attachments.files').findOne({ _id: id, 'metadata.verified': true });
  const uploaderId = file?.metadata?.uploaderId;
  const conversationId = file?.metadata?.conversationId;
  if (!(uploaderId instanceof mongoose.Types.ObjectId) || !uploaderId.equals(gate.context.user.id)
    || !(conversationId instanceof mongoose.Types.ObjectId)
    || !(await memberConversation(gate.context.user.id, conversationId.toString()))) {
    return jsonResponse({ error: 'Attachment not found.' }, 404);
  }
  const [inMessage, inGroupAvatar] = await Promise.all([
    Message.exists({ conversationId, 'attachments.fileId': id }),
    Conversation.exists({ _id: conversationId, avatarFileId: id }),
  ]);
  if (inMessage || inGroupAvatar) return jsonResponse({ error: 'This file is already in use.' }, 409);
  await new mongoose.mongo.GridFSBucket(database, { bucketName: 'connect_attachments' }).delete(id);
  return jsonResponse({ success: true });
}
