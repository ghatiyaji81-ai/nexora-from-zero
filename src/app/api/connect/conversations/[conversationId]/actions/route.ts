import mongoose from 'mongoose';
import { z } from 'zod';
import { findConversationFor, requireConnect } from '@/lib/server/connect';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { Message } from '@/models/message';
import { Conversation } from '@/models/conversation';
import { TypingState } from '@/models/typing-state';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ conversationId: string }> };
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('typing'), active: z.boolean() }),
  z.object({ action: z.literal('edit'), messageId: z.string().regex(/^[a-f\d]{24}$/i), body: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal('react'), messageId: z.string().regex(/^[a-f\d]{24}$/i), emoji: z.string().trim().min(1).max(8) }),
  z.object({ action: z.literal('delete-self'), messageId: z.string().regex(/^[a-f\d]{24}$/i) }),
  z.object({ action: z.literal('delete-everyone'), messageId: z.string().regex(/^[a-f\d]{24}$/i) }),
]);

export async function POST(request: Request, route: RouteContext) {
  const gate = await requireConnect(request, 'conversation-action', 120);
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  const found = await findConversationFor(gate.context, conversationId);
  if ('error' in found) return found.error;
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return jsonResponse({ error: 'That message action is not valid.' }, 400);
  const userId = new mongoose.Types.ObjectId(gate.context.user.id);
  const conversation = found.conversation;
  const action = parsed.data;
  if (action.action === 'typing') {
    if (action.active) {
      await TypingState.findOneAndUpdate({ conversationId: conversation._id, userId }, { $set: { expiresAt: new Date(Date.now() + 6000) } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
    } else await TypingState.deleteOne({ conversationId: conversation._id, userId });
    return jsonResponse({ success: true });
  }
  const message = await Message.findOne({ _id: action.messageId, conversationId: conversation._id, deletedForEveryoneAt: { $exists: false } });
  if (!message) return jsonResponse({ error: 'Message not found.' }, 404);
  if (action.action === 'edit') {
    const age = Date.now() - message.createdAt.getTime();
    if (!message.senderId.equals(userId) || age > 15 * 60_000) return jsonResponse({ error: 'Only your recent messages can be edited.' }, 403);
    message.body = action.body;
    message.editedAt = new Date();
    await message.save();
  } else if (action.action === 'react') {
    const existing = message.reactions.findIndex(reaction => reaction.userId.equals(userId) && reaction.emoji === action.emoji);
    if (existing >= 0) message.reactions.splice(existing, 1);
    else message.reactions.push({ userId, emoji: action.emoji, at: new Date() });
    await message.save();
  } else if (action.action === 'delete-self') {
    if (!message.deletedFor.some(id => id.equals(userId))) message.deletedFor.push(userId);
    await message.save();
  } else {
    const isGroupAdmin = conversation.type === 'group' && conversation.adminIds.some(id => id.equals(userId));
    if (!message.senderId.equals(userId) && !isGroupAdmin) return jsonResponse({ error: 'Only the sender or a group admin can remove this message for everyone.' }, 403);
    const maxAge = message.senderId.equals(userId) ? 60 * 60_000 : 24 * 60 * 60_000;
    if (Date.now() - message.createdAt.getTime() > maxAge) return jsonResponse({ error: 'This message is too old to remove for everyone.' }, 403);
    const files = message.attachments.map(attachment => attachment.fileId);
    message.body = '';
    message.attachments = [];
    message.deletedForEveryoneAt = new Date();
    await message.save();
    const database = mongoose.connection.db;
    if (database) {
      const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'connect_attachments' });
      const activeAvatars = await Conversation.distinct('avatarFileId', { avatarFileId: { $in: files } });
      const avatarIds = new Set(activeAvatars.map(fileId => fileId.toString()));
      await Promise.allSettled(files.filter(fileId => !avatarIds.has(fileId.toString())).map(fileId => bucket.delete(fileId)));
    }
  }
  return jsonResponse({ success: true });
}
