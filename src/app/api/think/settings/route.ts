import mongoose from 'mongoose';
import { z } from 'zod';
import { getThinkConfig, isThinkAgent, isThinkModel, requireThink } from '@/lib/server/think';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { ThinkPreference } from '@/models/think-preference';

export const runtime = 'nodejs';
const preferenceSchema = z.object({ provider: z.literal('openai').optional(), model: z.string().trim().min(1).max(100).optional(), agent: z.string().optional() }).strict();

export async function GET(request: Request) {
  const gate = await requireThink(request, 'settings-read');
  if ('response' in gate) return gate.response;
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const config = getThinkConfig();
  const preference = await ThinkPreference.findOne({ ownerId }).lean();
  return jsonResponse({
    provider: { id: config.provider, name: 'OpenAI', configured: config.configured, models: config.models, webSearchConfigured: config.webSearchConfigured },
    preference: { provider: preference?.provider ?? 'openai', model: preference?.modelId ?? config.defaultModel, agent: preference?.agent ?? 'general' },
  });
}

export async function PATCH(request: Request) {
  const gate = await requireThink(request, 'settings-write', 30);
  if ('response' in gate) return gate.response;
  const parsed = preferenceSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success || (parsed.data.model !== undefined && !isThinkModel(parsed.data.model))
    || (parsed.data.agent !== undefined && !isThinkAgent(parsed.data.agent))) {
    return jsonResponse({ error: 'Choose an available model and agent.' }, 400);
  }
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const previous = await ThinkPreference.findOne({ ownerId }).lean();
  const config = getThinkConfig();
  const preference = await ThinkPreference.findOneAndUpdate({ ownerId }, {
    $set: {
      provider: 'openai',
      modelId: parsed.data.model ?? previous?.modelId ?? config.defaultModel,
      agent: parsed.data.agent ?? previous?.agent ?? 'general',
    },
    $setOnInsert: { ownerId },
  }, { upsert: true, returnDocument: 'after', runValidators: true }).lean();
  return jsonResponse({ preference: { provider: preference?.provider ?? 'openai', model: preference?.modelId ?? config.defaultModel, agent: preference?.agent ?? 'general' } });
}
