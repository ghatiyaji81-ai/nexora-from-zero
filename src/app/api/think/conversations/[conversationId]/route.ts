import mongoose from 'mongoose';
import { z } from 'zod';
import { isThinkAgent, isThinkModel, requireThink } from '@/lib/server/think';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { ThinkConversation } from '@/models/think-conversation';
import { ThinkMessage } from '@/models/think-message';

export const runtime = 'nodejs';
type Context = { params: Promise<{ conversationId: string }> };
const updateSchema = z.object({ title: z.string().trim().min(1).max(100).optional(), model: z.string().trim().min(1).max(100).optional(), agent: z.string().optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() }).strict();

export async function GET(request: Request, route: Context) {
  const gate = await requireThink(request, 'conversation-read');
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  if (!mongoose.isValidObjectId(conversationId)) return jsonResponse({ error: 'Conversation not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const conversation = await ThinkConversation.findOne({ _id: conversationId, ownerId }).select('-ownerId').lean();
  if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);
  return jsonResponse({ conversation });
}

export async function PATCH(request: Request, route: Context) {
  const gate = await requireThink(request, 'conversation-update', 60);
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  const parsed = updateSchema.safeParse(await parseJsonBody(request));
  if (!mongoose.isValidObjectId(conversationId) || !parsed.success
    || (parsed.data.model !== undefined && !isThinkModel(parsed.data.model))
    || (parsed.data.agent !== undefined && !isThinkAgent(parsed.data.agent))) return jsonResponse({ error: 'Conversation settings are invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const { model, ...updates } = parsed.data;
  const set = { ...updates, ...(model ? { modelId: model } : {}) };
  const conversation = await ThinkConversation.findOneAndUpdate({ _id: conversationId, ownerId }, { $set: set }, { returnDocument: 'after', runValidators: true }).select('-ownerId').lean();
  if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);
  return jsonResponse({ conversation });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireThink(request, 'conversation-delete', 30);
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  if (!mongoose.isValidObjectId(conversationId)) return jsonResponse({ error: 'Conversation not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const conversation = await ThinkConversation.findOneAndDelete({ _id: conversationId, ownerId });
  if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);
  await ThinkMessage.deleteMany({ conversationId: conversation._id, ownerId });
  return jsonResponse({ success: true });
}
