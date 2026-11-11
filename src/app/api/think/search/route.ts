import mongoose from 'mongoose';
import { requireThink } from '@/lib/server/think';
import { jsonResponse } from '@/lib/server/http';
import { ThinkConversation } from '@/models/think-conversation';
import { ThinkMessage } from '@/models/think-message';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireThink(request, 'search', 60);
  if ('response' in gate) return gate.response;
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100) ?? '';
  if (query.length < 2) return jsonResponse({ results: [] });
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [conversations, messages] = await Promise.all([
    ThinkConversation.find({ ownerId, title: pattern }).sort({ updatedAt: -1 }).limit(10).select('_id title updatedAt').lean(),
    ThinkMessage.find({ ownerId, content: pattern }).sort({ createdAt: -1 }).limit(15).select('conversationId content createdAt').lean(),
  ]);
  const ids = [...new Set([...conversations.map(item => item._id.toString()), ...messages.map(item => item.conversationId.toString())])];
  const titles = await ThinkConversation.find({ _id: { $in: ids }, ownerId }).select('_id title').lean();
  const titleMap = new Map(titles.map(item => [item._id.toString(), item.title]));
  return jsonResponse({ results: [
    ...conversations.map(item => ({ id: item._id.toString(), conversationId: item._id.toString(), title: item.title, kind: 'conversation', createdAt: item.updatedAt })),
    ...messages.map(item => ({ id: item._id.toString(), conversationId: item.conversationId.toString(), title: titleMap.get(item.conversationId.toString()) ?? 'Conversation', excerpt: item.content.slice(0, 220), kind: 'message', createdAt: item.createdAt })),
  ] });
}
