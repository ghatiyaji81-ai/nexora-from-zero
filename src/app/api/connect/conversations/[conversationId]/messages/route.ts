import mongoose from 'mongoose';
import { z } from 'zod';
import { findConversationFor, requireConnect } from '@/lib/server/connect';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { Conversation } from '@/models/conversation';
import { Message } from '@/models/message';

export const runtime = 'nodejs';
const schema = z.object({
  body: z.string().trim().max(4000).default(''),
  replyTo: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  attachments: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(5).default([]),
});

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const gate = await requireConnect(request, 'messages-read', 240);
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  const found = await findConversationFor(gate.context, conversationId);
  if ('error' in found) return found.error;
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '40', 10) || 40));
  const beforeAt = url.searchParams.get('beforeAt');
  const beforeId = url.searchParams.get('beforeId');
  const filter: Record<string, unknown> = {
    conversationId: found.conversation._id,
    deletedForEveryoneAt: { $exists: false },
    deletedFor: { $ne: new mongoose.Types.ObjectId(gate.context.user.id) },
  };
  if (beforeAt && beforeId && mongoose.isValidObjectId(beforeId) && !Number.isNaN(Date.parse(beforeAt))) {
    filter.$or = [
      { createdAt: { $lt: new Date(beforeAt) } },
      { createdAt: new Date(beforeAt), _id: { $lt: new mongoose.Types.ObjectId(beforeId) } },
    ];
  }
  const page = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = page.length > limit;
  const messages = page.slice(0, limit);
  const userId = new mongoose.Types.ObjectId(gate.context.user.id);
  const deliveredIds = messages.filter(message => !message.senderId.equals(userId) && !message.deliveredTo.some(receipt => receipt.userId.equals(userId))).map(message => message._id);
  if (deliveredIds.length) await Message.updateMany({ _id: { $in: deliveredIds }, 'deliveredTo.userId': { $ne: userId } }, { $addToSet: { deliveredTo: { userId, at: new Date() } } });
  return jsonResponse({ hasMore, messages: messages.reverse().map(message => ({ ...message, id: message._id.toString(), senderId: message.senderId.toString(), conversationId: message.conversationId.toString(), replyTo: message.replyTo?.toString(), deletedFor: message.deletedFor.map(id => id.toString()), deliveredTo: message.deliveredTo.map(receipt => ({ userId: receipt.userId.toString(), at: receipt.at })), readBy: message.readBy.map(receipt => ({ userId: receipt.userId.toString(), at: receipt.at })), reactions: message.reactions.map(reaction => ({ userId: reaction.userId.toString(), emoji: reaction.emoji, at: reaction.at })), attachments: message.attachments.map(attachment => ({ ...attachment, fileId: attachment.fileId.toString() })) })) });
}

export async function POST(request: Request, route: RouteContext) {
  const gate = await requireConnect(request, 'message-send', 60);
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  const found = await findConversationFor(gate.context, conversationId);
  if ('error' in found) return found.error;
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success || (!parsed.data.body && !parsed.data.attachments.length)) return jsonResponse({ error: 'Write a message or add an attachment.' }, 400);
  const actorId = new mongoose.Types.ObjectId(gate.context.user.id);
  let replyTo: mongoose.Types.ObjectId | undefined;
  if (parsed.data.replyTo) {
    replyTo = new mongoose.Types.ObjectId(parsed.data.replyTo);
    const reply = await Message.findOne({ _id: replyTo, conversationId: found.conversation._id, deletedForEveryoneAt: { $exists: false } }).select('_id').lean();
    if (!reply) return jsonResponse({ error: 'The replied-to message is unavailable.' }, 400);
  }
  const attachments: Array<{ fileId: mongoose.Types.ObjectId; fileName: string; contentType: string; size: number; kind: 'image' | 'video' | 'document' | 'audio' }> = [];
  if (parsed.data.attachments.length) {
    const database = mongoose.connection.db;
    if (!database) return jsonResponse({ error: 'File storage is unavailable.' }, 503);
    const files = await database.collection('connect_attachments.files').find({ _id: { $in: parsed.data.attachments.map(id => new mongoose.Types.ObjectId(id)) }, 'metadata.conversationId': found.conversation._id, 'metadata.uploaderId': actorId, 'metadata.verified': true }).toArray();
    if (files.length !== parsed.data.attachments.length) return jsonResponse({ error: 'An attachment is invalid or no longer available.' }, 400);
    const fileIds = files.map(file => file._id as mongoose.Types.ObjectId);
    const [alreadyAttached, alreadyAvatar] = await Promise.all([
      Message.exists({ 'attachments.fileId': { $in: fileIds } }),
      Conversation.exists({ avatarFileId: { $in: fileIds } }),
    ]);
    if (alreadyAttached || alreadyAvatar) return jsonResponse({ error: 'An attachment has already been used.' }, 409);
    for (const file of files) {
      const metadata = file.metadata as Record<string, unknown>;
      attachments.push({ fileId: file._id as mongoose.Types.ObjectId, fileName: String(metadata.originalName), contentType: String(metadata.contentType), size: Number(file.length), kind: metadata.kind as 'image' | 'video' | 'document' | 'audio' });
    }
  }
  const session = await mongoose.startSession();
  let messageId = '';
  try {
    await session.withTransaction(async () => {
      const [message] = await Message.create([{
        conversationId: found.conversation._id, senderId: actorId, body: parsed.data.body,
        replyTo, attachments,
      }], { session });
      messageId = message._id.toString();
      await Conversation.updateOne({ _id: found.conversation._id }, {
        $set: { lastMessageAt: message.createdAt, lastMessageText: parsed.data.body || (attachments[0] ? `Shared ${attachments[0].kind}` : ''), lastMessageSenderId: actorId },
      }, { session });
    });
  } finally {
    await session.endSession();
  }
  return jsonResponse({ messageId }, 201);
}
