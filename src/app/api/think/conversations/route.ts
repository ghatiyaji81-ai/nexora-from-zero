import mongoose from 'mongoose';
import { z } from 'zod';
import { getThinkConfig, isThinkAgent, isThinkModel, requireThink } from '@/lib/server/think';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { ThinkConversation } from '@/models/think-conversation';
import { ThinkPreference } from '@/models/think-preference';

export const runtime = 'nodejs';
const createSchema = z.object({ title: z.string().trim().min(1).max(100).optional(), model: z.string().trim().min(1).max(100).optional(), agent: z.string().optional() }).strict();

export async function GET(request: Request) {
  const gate = await requireThink(request, 'conversation-list');
  if ('response' in gate) return gate.response;
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const archived = new URL(request.url).searchParams.get('archived') === '1';
  const conversations = await ThinkConversation.find({ ownerId, archived }).sort({ pinned: -1, lastMessageAt: -1, updatedAt: -1 }).limit(100).select('-ownerId').lean();
  return jsonResponse({ conversations });
}

export async function POST(request: Request) {
  const gate = await requireThink(request, 'conversation-create', 40);
  if ('response' in gate) return gate.response;
  const parsed = createSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success || (parsed.data.model !== undefined && !isThinkModel(parsed.data.model))
    || (parsed.data.agent !== undefined && !isThinkAgent(parsed.data.agent))) return jsonResponse({ error: 'Choose an available model and agent.' }, 400);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const preference = await ThinkPreference.findOne({ ownerId }).lean();
  const config = getThinkConfig();
  const conversation = await ThinkConversation.create({
    ownerId,
    title: parsed.data.title ?? 'New conversation',
    provider: 'openai',
    modelId: parsed.data.model ?? preference?.modelId ?? config.defaultModel,
    agent: (parsed.data.agent ?? preference?.agent ?? 'general') as 'general' | 'research' | 'coding' | 'study' | 'writing' | 'analysis',
  });
  return jsonResponse({ conversation: { id: conversation._id.toString(), title: conversation.title, model: conversation.modelId, agent: conversation.agent, pinned: false, archived: false, lastMessagePreview: '', updatedAt: conversation.updatedAt } }, 201);
}
