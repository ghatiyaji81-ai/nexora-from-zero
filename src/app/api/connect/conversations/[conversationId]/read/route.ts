import mongoose from 'mongoose';
import { requireConnect } from '@/lib/server/connect';
import { jsonResponse } from '@/lib/server/http';
import { findConversationFor } from '@/lib/server/connect';
import { Message } from '@/models/message';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, route: RouteContext) {
  const gate = await requireConnect(request, 'message-read-receipt', 120);
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  const found = await findConversationFor(gate.context, conversationId);
  if ('error' in found) return found.error;
  const userId = new mongoose.Types.ObjectId(gate.context.user.id);
  const at = new Date();
  await Message.updateMany({ conversationId: found.conversation._id, senderId: { $ne: userId }, 'readBy.userId': { $ne: userId }, deletedForEveryoneAt: { $exists: false } }, { $addToSet: { readBy: { userId, at }, deliveredTo: { userId, at } } });
  return jsonResponse({ success: true });
}
