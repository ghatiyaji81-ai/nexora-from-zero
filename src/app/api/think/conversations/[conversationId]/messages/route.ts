import mongoose from 'mongoose';
import { z } from 'zod';
import { getAIProvider, ProviderRequestError } from '@/lib/server/think-provider';
import { getThinkConfig, isThinkAgent, isThinkModel, requireThink, sseEvent, THINK_AGENTS } from '@/lib/server/think';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { ThinkConversation } from '@/models/think-conversation';
import { ThinkDocument } from '@/models/think-document';
import { ThinkMessage, type ThinkCitation, type ThinkToolExecution } from '@/models/think-message';

export const runtime = 'nodejs';
export const maxDuration = 90;
type Context = { params: Promise<{ conversationId: string }> };
const requestSchema = z.object({
  content: z.string().trim().max(4000).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  agent: z.string().optional(),
  documentIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(5).optional(),
  mode: z.enum(['send', 'regenerate', 'continue']).default('send'),
  messageId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
}).strict();

function publicMessage(message: { _id: mongoose.Types.ObjectId; role: string; content: string; modelId: string; agent: string; documentIds?: mongoose.Types.ObjectId[]; citations?: ThinkCitation[]; toolExecutions?: ThinkToolExecution[]; status: string; createdAt: Date }) {
  return {
    id: message._id.toString(), role: message.role, content: message.content, model: message.modelId,
    agent: message.agent, documentIds: (message.documentIds ?? []).map(id => id.toString()),
    citations: message.citations ?? [], toolExecutions: message.toolExecutions ?? [], status: message.status, createdAt: message.createdAt,
  };
}

function documentContext(documents: Array<{ name: string; extractedText: string }>) {
  let remaining = 36_000;
  const blocks: string[] = [];
  for (const document of documents) {
    if (remaining <= 0) break;
    const text = document.extractedText.slice(0, remaining);
    remaining -= text.length;
    const name = document.name.replace(/[<>"&]/g, '').slice(0, 120);
    blocks.push(`<untrusted_document name="${name}">\n${text}\n</untrusted_document>`);
  }
  return blocks.join('\n\n');
}

function boundedHistoryContent(content: string) {
  return content.length > 6000 ? content.slice(-6000) : content;
}

export async function GET(request: Request, route: Context) {
  const gate = await requireThink(request, 'message-history');
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  if (!mongoose.isValidObjectId(conversationId)) return jsonResponse({ error: 'Conversation not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const conversation = await ThinkConversation.exists({ _id: conversationId, ownerId });
  if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);
  const url = new URL(request.url);
  const before = url.searchParams.get('before');
  const filter: Record<string, unknown> = { conversationId, ownerId };
  if (before && mongoose.isValidObjectId(before)) filter._id = { $lt: new mongoose.Types.ObjectId(before) };
  const page = await ThinkMessage.find(filter).sort({ _id: -1 }).limit(41).lean();
  const hasMore = page.length > 40;
  const messages = page.slice(0, 40).reverse().map(message => ({
    id: message._id.toString(), role: message.role, content: message.content, model: message.modelId,
    agent: message.agent, documentIds: message.documentIds.map(id => id.toString()), citations: message.citations,
    toolExecutions: message.toolExecutions, status: message.status, createdAt: message.createdAt,
  }));
  return jsonResponse({ messages, hasMore, nextCursor: hasMore ? page[39]._id.toString() : null });
}

export async function POST(request: Request, route: Context) {
  const gate = await requireThink(request, 'chat-send', 30);
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  const parsed = requestSchema.safeParse(await parseJsonBody(request, 24 * 1024));
  if (!mongoose.isValidObjectId(conversationId) || !parsed.success
    || (parsed.data.model !== undefined && !isThinkModel(parsed.data.model))
    || (parsed.data.agent !== undefined && !isThinkAgent(parsed.data.agent))) return jsonResponse({ error: 'The message request is invalid.' }, 400);
  const config = getThinkConfig();
  if (!config.configured) return jsonResponse({ error: 'The AI provider is not configured. Add OPENAI_API_KEY to the server environment.' }, 503);

  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  const conversation = await ThinkConversation.findOne({ _id: conversationId, ownerId });
  if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);
  const model = parsed.data.model ?? conversation.modelId;
  const agent = (parsed.data.agent ?? conversation.agent) as 'general' | 'research' | 'coding' | 'study' | 'writing' | 'analysis';
  let userMessage: InstanceType<typeof ThinkMessage> | null = null;
  let assistantMessage: InstanceType<typeof ThinkMessage> | null = null;
  let providerInput: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let selectedDocuments: Array<{ name: string; extractedText: string }> = [];

  const busyFilter: Record<string, unknown> = { conversationId, ownerId, status: 'streaming', updatedAt: { $gt: new Date(Date.now() - 3 * 60_000) } };
  if (parsed.data.mode === 'regenerate' && parsed.data.messageId && mongoose.isValidObjectId(parsed.data.messageId)) busyFilter._id = { $ne: new mongoose.Types.ObjectId(parsed.data.messageId) };
  const busy = await ThinkMessage.exists(busyFilter);
  if (busy) return jsonResponse({ error: 'A response is already being generated in this conversation.' }, 409);

  if (parsed.data.mode === 'send') {
    const content = parsed.data.content?.trim() ?? '';
    const documentIds = [...new Set(parsed.data.documentIds ?? [])].map(id => new mongoose.Types.ObjectId(id));
    if ((!content && !documentIds.length) || content.length > 4000) return jsonResponse({ error: 'Write a message or attach a document.' }, 400);
    if (documentIds.length) {
      const docs = await ThinkDocument.find({ ownerId, _id: { $in: documentIds } }).select('+extractedText name').lean();
      if (docs.length !== documentIds.length) return jsonResponse({ error: 'One or more documents are unavailable.' }, 404);
      selectedDocuments = docs.map(doc => ({ name: doc.name, extractedText: doc.extractedText }));
    }
    userMessage = await ThinkMessage.create({ conversationId, ownerId, role: 'user', content: content || 'Please summarize the attached document(s).', provider: 'openai', modelId: model, agent, documentIds, status: 'complete' });
    assistantMessage = await ThinkMessage.create({ conversationId, ownerId, role: 'assistant', content: '', provider: 'openai', modelId: model, agent, documentIds, status: 'streaming' });
      providerInput = (await ThinkMessage.find({ conversationId, ownerId, _id: { $lt: assistantMessage._id } }).sort({ _id: -1 }).limit(20).lean()).reverse().map(message => ({
        role: message.role, content: message._id.equals(userMessage!._id) && selectedDocuments.length
        ? `${boundedHistoryContent(message.content)}\n\n${documentContext(selectedDocuments)}`
        : boundedHistoryContent(message.content),
    }));
    if (conversation.title === 'New conversation') await ThinkConversation.updateOne({ _id: conversation._id, ownerId }, { $set: { title: (content || selectedDocuments[0]?.name || 'New conversation').slice(0, 72) } });
  } else {
    if (!parsed.data.messageId || !mongoose.isValidObjectId(parsed.data.messageId)) return jsonResponse({ error: 'Choose a response to continue or regenerate.' }, 400);
    assistantMessage = await ThinkMessage.findOne({ _id: parsed.data.messageId, conversationId, ownerId, role: 'assistant' });
    const latest = await ThinkMessage.findOne({ conversationId, ownerId }).sort({ _id: -1 }).select('_id').lean();
    if (!assistantMessage || !latest?._id.equals(assistantMessage._id)) return jsonResponse({ error: 'Only the latest assistant response can be continued or regenerated.' }, 409);
    if (parsed.data.mode === 'regenerate') {
      const previous = await ThinkMessage.findOne({ conversationId, ownerId, role: 'user', _id: { $lt: assistantMessage._id } }).sort({ _id: -1 }).lean();
      if (!previous) return jsonResponse({ error: 'There is no prompt to regenerate.' }, 409);
      userMessage = await ThinkMessage.findById(previous._id);
      selectedDocuments = previous.documentIds.length
        ? (await ThinkDocument.find({ ownerId, _id: { $in: previous.documentIds } }).select('+extractedText name').lean()).map(doc => ({ name: doc.name, extractedText: doc.extractedText }))
        : [];
      providerInput = (await ThinkMessage.find({ conversationId, ownerId, _id: { $lt: assistantMessage._id } }).sort({ _id: -1 }).limit(20).lean()).reverse().map(message => ({
        role: message.role, content: message._id.equals(previous._id) && selectedDocuments.length
          ? `${boundedHistoryContent(message.content)}\n\n${documentContext(selectedDocuments)}`
          : boundedHistoryContent(message.content),
      }));
      assistantMessage.content = '';
      assistantMessage.status = 'streaming';
      assistantMessage.citations = [];
      assistantMessage.toolExecutions = [];
      assistantMessage.modelId = model;
      assistantMessage.agent = agent;
      await assistantMessage.save();
    } else {
      providerInput = (await ThinkMessage.find({ conversationId, ownerId, _id: { $lte: assistantMessage._id } }).sort({ _id: -1 }).limit(20).lean()).reverse().map(message => ({ role: message.role, content: boundedHistoryContent(message.content) }));
      providerInput.push({ role: 'user', content: 'Continue from your last sentence. Do not repeat text already written.' });
      assistantMessage.modelId = model;
      assistantMessage.agent = agent;
      assistantMessage.status = 'streaming';
      await assistantMessage.save();
    }
  }

  await ThinkConversation.updateOne({ _id: conversation._id, ownerId }, { $set: { modelId: model, agent } });
  const provider = getAIProvider();
  const providerAbort = new AbortController();
  let streamCancelled = false;
  const eventStream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => { if (!streamCancelled) controller.enqueue(encoder.encode(sseEvent(event, data))); };
      const citations: ThinkCitation[] = [];
      const tools: ThinkToolExecution[] = [];
      let generated = parsed.data.mode === 'continue' ? assistantMessage!.content : '';
      send('meta', { conversationId, userMessage: userMessage ? publicMessage(userMessage) : null, assistantMessageId: assistantMessage!._id.toString(), model, agent });
      void (async () => {
        try {
          const combinedSignal = AbortSignal.any([request.signal, providerAbort.signal]);
          for await (const event of provider.stream({ model, agent, messages: providerInput, signal: combinedSignal })) {
            if (event.type === 'delta') {
              generated += event.text;
              if (generated.length > 60_000) throw new ProviderRequestError('The response exceeded the safe storage limit.', 502);
              send('delta', { text: event.text });
            } else if (event.type === 'citation') {
              if (!citations.some(item => item.url === event.citation.url)) citations.push(event.citation);
              send('citation', event.citation);
            } else {
              send('tool', { name: event.name, status: event.status });
              if (event.status === 'completed' && !tools.some(item => item.name === event.name)) tools.push({ name: event.name, input: 'Provider-managed web search', outcome: 'completed', summary: 'Searched public web sources for this research response.', createdAt: new Date() });
            }
          }
          if (!generated.trim()) throw new ProviderRequestError('The provider completed without returning a text response.');
          await ThinkMessage.updateOne({ _id: assistantMessage!._id, ownerId }, { $set: { content: generated, status: 'complete', citations, toolExecutions: tools, model, agent } });
          await ThinkConversation.updateOne({ _id: conversation._id, ownerId }, { $set: { lastMessageAt: new Date(), lastMessagePreview: generated.replace(/\s+/g, ' ').slice(0, 180), model, agent } });
          send('done', { messageId: assistantMessage!._id.toString() });
          if (!streamCancelled) controller.close();
        } catch (error) {
          const aborted = combinedWasAborted(request.signal, providerAbort.signal);
          const status = aborted ? 'interrupted' : 'failed';
          if (generated.trim()) await ThinkMessage.updateOne({ _id: assistantMessage!._id, ownerId }, { $set: { content: generated, status, citations, toolExecutions: tools } });
          else await ThinkMessage.updateOne({ _id: assistantMessage!._id, ownerId }, { $set: { status } });
          if (!aborted) {
            const message = error instanceof ProviderRequestError ? error.message : 'The AI response could not be completed. Try again.';
            send('error', { message });
          }
          if (!streamCancelled) controller.close();
        }
      })();
    },
    cancel() { streamCancelled = true; providerAbort.abort(); },
  });

  return new Response(eventStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function combinedWasAborted(requestSignal: AbortSignal, streamSignal: AbortSignal) {
  return requestSignal.aborted || streamSignal.aborted;
}
