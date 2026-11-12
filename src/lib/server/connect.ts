import 'server-only';
import mongoose from 'mongoose';
import { getAuthenticatedContext, type AuthenticatedContext } from '@/lib/server/auth-session';
import { connectToDatabase } from '@/lib/server/db';
import { jsonResponse, requestIsSameOrigin } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/auth-rate-limit';
import { Conversation, type ConversationRecord } from '@/models/conversation';
import { hasSocialBlockBetween } from '@/lib/server/social';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function connectContext() {
  const context = await getAuthenticatedContext();
  if (!context) return null;
  await connectToDatabase();
  return context;
}

export function objectId(value: string | null | undefined) {
  return value && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

export async function memberConversation(userId: string, conversationId: string) {
  const id = objectId(conversationId);
  if (!id) return null;
  const viewerId = new mongoose.Types.ObjectId(userId);
  const conversation = await Conversation.findOne({ _id: id, memberIds: viewerId });
  if (!conversation) return null;
  if (conversation.type === 'direct') {
    const otherMember = conversation.memberIds.find(memberId => !memberId.equals(viewerId));
    if (otherMember && await hasSocialBlockBetween(viewerId, otherMember)) return null;
  }
  return conversation;
}

export async function requireConnect(request: Request, scope: string, limit = 90) {
  const context = await connectContext();
  if (!context) return { response: jsonResponse({ error: 'Sign in to use Connect.' }, 401) };
  if (!requestIsSameOrigin(request) && request.method !== 'GET') {
    return { response: jsonResponse({ error: 'Request origin could not be verified.' }, 403) };
  }
  const budget = await consumeRateLimit(request, `connect:${scope}`, limit, 60_000, context.user.id);
  if (!budget.allowed) {
    return { response: jsonResponse({ error: 'You are doing that too often. Try again shortly.' }, 429, { 'Retry-After': String(budget.retryAfterSeconds) }) };
  }
  return { context };
}

export function requireObjectId(value: string | null | undefined, label: string) {
  const id = objectId(value);
  return id ? { id } : { response: jsonResponse({ error: `${label} is invalid.` }, 400) };
}

export function asConversationId(conversation: ConversationRecord) {
  return conversation._id.toString();
}

export async function findConversationFor(context: AuthenticatedContext, id: string) {
  const parsedId = objectId(id);
  if (!parsedId) return { error: jsonResponse({ error: 'Conversation not found.' }, 404) };
  const conversation = await memberConversation(context.user.id, parsedId.toString());
  if (!conversation) return { error: jsonResponse({ error: 'Conversation not found.' }, 404) };
  return { conversation };
}
