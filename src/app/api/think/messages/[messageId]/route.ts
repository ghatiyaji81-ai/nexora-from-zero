import mongoose from 'mongoose';
import { z } from 'zod';
import { requireThink } from '@/lib/server/think';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { ThinkMessage } from '@/models/think-message';

export const runtime = 'nodejs';
type Context = { params: Promise<{ messageId: string }> };
const editSchema = z.object({ content: z.string().trim().min(1).max(4000) }).strict();

export async function PATCH(request: Request, route: Context) {
  const gate = await requireThink(request, 'message-edit', 40);
  if ('response' in gate) return gate.response;
  const { messageId } = await route.params;
  const parsed = editSchema.safeParse(await parseJsonBody(request));
  if (!mongoose.isValidObjectId(messageId) || !parsed.success) return jsonResponse({ error: 'The edited message is invalid.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const message = await ThinkMessage.findOne({ _id: messageId, ownerId, role: 'user' });
  if (!message) return jsonResponse({ error: 'Message not found.' }, 404);
  const latest = await ThinkMessage.findOne({ conversationId: message.conversationId, ownerId }).sort({ _id: -1 }).lean();
  const latestAssistant = latest?.role === 'assistant' ? latest : null;
  if (!latestAssistant) return jsonResponse({ error: 'Only the latest user prompt can be edited.' }, 409);
  const previousPrompt = await ThinkMessage.findOne({ conversationId: message.conversationId, ownerId, role: 'user', _id: { $lt: latestAssistant._id } }).sort({ _id: -1 }).select('_id').lean();
  if (!previousPrompt?._id.equals(message._id) || latestAssistant.status === 'streaming') return jsonResponse({ error: 'Only the latest completed prompt can be edited.' }, 409);
  message.content = parsed.data.content;
  await message.save();
  await ThinkMessage.updateOne({ _id: latestAssistant._id, ownerId }, { $set: { content: '', citations: [], toolExecutions: [], status: 'streaming' } });
  return jsonResponse({ success: true, assistantMessageId: latestAssistant._id.toString(), conversationId: message.conversationId.toString() });
}
