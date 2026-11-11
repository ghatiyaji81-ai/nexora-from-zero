import { findConversationFor, requireConnect } from '@/lib/server/connect';
import { jsonResponse } from '@/lib/server/http';
import { Message } from '@/models/message';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const gate = await requireConnect(request, 'media-gallery', 90);
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  const found = await findConversationFor(gate.context, conversationId);
  if ('error' in found) return found.error;
  const messages = await Message.find({ conversationId: found.conversation._id, 'attachments.0': { $exists: true }, deletedForEveryoneAt: { $exists: false } }).sort({ createdAt: -1 }).limit(100).select('attachments createdAt senderId').lean();
  return jsonResponse({ media: messages.flatMap(message => message.attachments.map(attachment => ({ fileId: attachment.fileId.toString(), fileName: attachment.fileName, contentType: attachment.contentType, size: attachment.size, kind: attachment.kind, sentAt: message.createdAt, senderId: message.senderId.toString() }))) });
}
