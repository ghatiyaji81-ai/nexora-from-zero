import mongoose from 'mongoose';
import { z } from 'zod';
import { requireConnect } from '@/lib/server/connect';
import { jsonResponse } from '@/lib/server/http';
import { Conversation } from '@/models/conversation';
import { Message } from '@/models/message';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireConnect(request, 'message-search', 60);
  if ('response' in gate) return gate.response;
  const query = z.string().trim().min(1).max(100).safeParse(new URL(request.url).searchParams.get('q'));
  if (!query.success) return jsonResponse({ conversations: [], messages: [] });
  const escaped = query.data.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const userId = new mongoose.Types.ObjectId(gate.context.user.id);
  const conversations = await Conversation.find({ memberIds: userId, $or: [{ title: { $regex: escaped, $options: 'i' } }, { lastMessageText: { $regex: escaped, $options: 'i' } }] }).sort({ lastMessageAt: -1 }).limit(12).select('_id type title lastMessageText lastMessageAt').lean();
  const accessibleIds = await Conversation.find({ memberIds: userId }).distinct('_id');
  const messages = await Message.find({ conversationId: { $in: accessibleIds }, body: { $regex: escaped, $options: 'i' }, deletedForEveryoneAt: { $exists: false }, deletedFor: { $ne: userId } }).sort({ createdAt: -1 }).limit(30).select('_id conversationId senderId body createdAt').lean();
  return jsonResponse({ conversations: conversations.map(item => ({ id: item._id.toString(), type: item.type, title: item.title, preview: item.lastMessageText, at: item.lastMessageAt })), messages: messages.map(item => ({ id: item._id.toString(), conversationId: item.conversationId.toString(), senderId: item.senderId.toString(), body: item.body, at: item.createdAt })) });
}
