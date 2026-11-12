import mongoose from 'mongoose';
import { requireConnect } from '@/lib/server/connect';
import { jsonResponse } from '@/lib/server/http';
import { findConversationFor } from '@/lib/server/connect';
import { Conversation } from '@/models/conversation';
import { Message } from '@/models/message';
import { Presence } from '@/models/presence';
import { TypingState } from '@/models/typing-state';
import { hasSocialBlockBetween } from '@/lib/server/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = { params: Promise<{ conversationId: string }> };
type MessageEventDocument = { _id: mongoose.Types.ObjectId; senderId: mongoose.Types.ObjectId; deliveredTo: Array<{ userId: mongoose.Types.ObjectId }> };
type TypingEventDocument = { userId?: mongoose.Types.ObjectId; expiresAt?: Date };
type PresenceEventDocument = { userId?: mongoose.Types.ObjectId; expiresAt?: Date; lastSeenAt?: Date };

export async function GET(request: Request, route: RouteContext) {
  const gate = await requireConnect(request, 'realtime-stream', 10);
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  const found = await findConversationFor(gate.context, conversationId);
  if ('error' in found) return found.error;
  const conversationObjectId = found.conversation._id;
  const thisUserId = new mongoose.Types.ObjectId(gate.context.user.id);
  const encoder = new TextEncoder();
  let messageStream: ReturnType<typeof Message.watch> | undefined;
  let typingStream: ReturnType<typeof TypingState.watch> | undefined;
  let presenceStream: ReturnType<typeof Presence.watch> | undefined;
  let conversationStream: ReturnType<typeof Conversation.watch> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let membershipCheck: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (kind: string, data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const close = async () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (membershipCheck) clearInterval(membershipCheck);
        await Promise.allSettled([messageStream?.close(), typingStream?.close(), presenceStream?.close(), conversationStream?.close()]);
        try { controller.close(); } catch { /* response already closed */ }
      };
      const stillMember = async () => {
        const current = await Conversation.findOne({ _id: conversationObjectId, memberIds: thisUserId }).select('type memberIds').lean();
        if (!current) return false;
        if (current.type !== 'direct') return true;
        const otherMember = current.memberIds.find(memberId => !memberId.equals(thisUserId));
        return !otherMember || !await hasSocialBlockBetween(thisUserId, otherMember);
      };
      const revokeIfRemoved = async () => {
        if (await stillMember()) return false;
        send('revoked', {});
        await close();
        return true;
      };
      request.signal.addEventListener('abort', () => { void close(); }, { once: true });
      try {
        messageStream = Message.watch([{ $match: { 'fullDocument.conversationId': conversationObjectId } }], { fullDocument: 'updateLookup' });
        typingStream = TypingState.watch([{ $match: { 'fullDocument.conversationId': conversationObjectId } }], { fullDocument: 'updateLookup' });
        const otherMemberIds = found.conversation.memberIds.filter(id => !id.equals(thisUserId));
        presenceStream = Presence.watch([{ $match: { 'fullDocument.userId': { $in: otherMemberIds } } }], { fullDocument: 'updateLookup' });
        conversationStream = Conversation.watch([{ $match: { 'documentKey._id': conversationObjectId } }], { fullDocument: 'updateLookup' });
        messageStream.on('change', change => {
          void (async () => {
            if (await revokeIfRemoved()) return;
            const message = (change as unknown as { fullDocument?: MessageEventDocument }).fullDocument;
            if (!message) { send('refresh', {}); return; }
            if (!message.senderId.equals(thisUserId) && !message.deliveredTo.some((receipt: { userId: mongoose.Types.ObjectId }) => receipt.userId.equals(thisUserId))) {
              await Message.updateOne({ _id: message._id, 'deliveredTo.userId': { $ne: thisUserId } }, { $addToSet: { deliveredTo: { userId: thisUserId, at: new Date() } } });
            }
            send('message', { id: message._id.toString(), conversationId, senderId: message.senderId.toString() });
          })().catch(() => { send('error', { message: 'Could not verify conversation access.' }); void close(); });
        });
        typingStream.on('change', change => {
          void (async () => {
            if (await revokeIfRemoved()) return;
            const state = (change as unknown as { fullDocument?: TypingEventDocument }).fullDocument;
            send('typing', { userId: state?.userId?.toString(), expiresAt: state?.expiresAt, removed: !state });
          })().catch(() => { send('error', { message: 'Could not verify conversation access.' }); void close(); });
        });
        presenceStream.on('change', change => {
          void (async () => {
            if (await revokeIfRemoved()) return;
            const state = (change as unknown as { fullDocument?: PresenceEventDocument }).fullDocument;
            send('presence', { userId: state?.userId?.toString(), online: Boolean(state?.expiresAt && state.expiresAt > new Date()), lastSeenAt: state?.lastSeenAt });
          })().catch(() => { send('error', { message: 'Could not verify conversation access.' }); void close(); });
        });
        conversationStream.on('change', change => {
          void revokeIfRemoved().then(removed => { if (!removed) send('conversation', {}); });
        });
        for (const stream of [messageStream, typingStream, presenceStream, conversationStream]) {
          stream.on('error', error => {
            console.error('[connect/events] MongoDB stream failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
            send('error', { message: 'Real-time connection was interrupted.' });
            void close();
          });
        }
        send('ready', { conversationId });
        heartbeat = setInterval(() => send('heartbeat', { at: Date.now() }), 20_000);
        membershipCheck = setInterval(() => {
          void revokeIfRemoved().catch(() => { send('error', { message: 'Could not confirm conversation access.' }); void close(); });
        }, 15_000);
      } catch (error) {
        console.error('[connect/events] stream setup failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
        send('error', { message: 'Real-time updates are unavailable.' });
        await close();
      }
    },
    cancel() { closed = true; if (heartbeat) clearInterval(heartbeat); if (membershipCheck) clearInterval(membershipCheck); void Promise.allSettled([messageStream?.close(), typingStream?.close(), presenceStream?.close(), conversationStream?.close()]); },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
