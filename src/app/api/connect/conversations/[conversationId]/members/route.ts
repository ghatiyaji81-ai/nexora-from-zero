import mongoose from 'mongoose';
import { z } from 'zod';
import { findConversationFor, requireConnect } from '@/lib/server/connect';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { Conversation } from '@/models/conversation';
import { Message } from '@/models/message';
import { TypingState } from '@/models/typing-state';
import { User } from '@/models/user';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ conversationId: string }> };
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), userIds: z.array(z.string().regex(/^[a-f\d]{24}$/i).transform(id => id.toLowerCase())).min(1).max(20) }),
  z.object({ action: z.literal('remove'), userId: z.string().regex(/^[a-f\d]{24}$/i).transform(id => id.toLowerCase()) }),
  z.object({ action: z.literal('admin'), userId: z.string().regex(/^[a-f\d]{24}$/i).transform(id => id.toLowerCase()), enabled: z.boolean() }),
  z.object({ action: z.literal('settings'), title: z.string().trim().min(2).max(80).optional(), description: z.string().trim().max(500).optional(), avatarFileId: z.string().regex(/^[a-f\d]{24}$/i).transform(id => id.toLowerCase()).nullable().optional(), allowMemberInvites: z.boolean().optional(), allowMemberEditInfo: z.boolean().optional() }).refine(value => Object.keys(value).length > 1),
]);

export async function POST(request: Request, route: RouteContext) {
  const gate = await requireConnect(request, 'group-members', 30);
  if ('response' in gate) return gate.response;
  const { conversationId } = await route.params;
  const found = await findConversationFor(gate.context, conversationId);
  if ('error' in found) return found.error;
  const conversation = found.conversation;
  if (conversation.type !== 'group') return jsonResponse({ error: 'Member settings are only available in groups.' }, 400);
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return jsonResponse({ error: 'Group change is not valid.' }, 400);
  const actorId = new mongoose.Types.ObjectId(gate.context.user.id);
  const isAdmin = conversation.adminIds.some(id => id.equals(actorId));
  const action = parsed.data;
  if (action.action === 'add') {
    if (!isAdmin && !conversation.allowMemberInvites) return jsonResponse({ error: 'Only a group admin can add members.' }, 403);
    const ids = [...new Set(action.userIds)].map(id => new mongoose.Types.ObjectId(id)).filter(id => !conversation.memberIds.some(current => current.equals(id)));
    if (conversation.memberIds.length + ids.length > 50) return jsonResponse({ error: 'Groups can have up to 50 members.' }, 400);
    const activeCount = await User.countDocuments({ _id: { $in: ids }, status: 'active' });
    if (activeCount !== ids.length) return jsonResponse({ error: 'One or more members could not be found.' }, 400);
    conversation.memberIds.push(...ids);
  } else if (action.action === 'remove') {
    const target = new mongoose.Types.ObjectId(action.userId);
    const isSelf = actorId.equals(target);
    if (!isSelf && !isAdmin) return jsonResponse({ error: 'Only a group admin can remove another member.' }, 403);
    if (!conversation.memberIds.some(id => id.equals(target))) return jsonResponse({ error: 'Member not found.' }, 404);
    if (!isSelf && conversation.adminIds.some(id => id.equals(target)) && conversation.adminIds.length === 1) return jsonResponse({ error: 'Assign another admin before removing the last group admin.' }, 409);
    conversation.memberIds = conversation.memberIds.filter(id => !id.equals(target));
    conversation.adminIds = conversation.adminIds.filter(id => !id.equals(target));
    await TypingState.deleteOne({ conversationId: conversation._id, userId: target });
    if (isSelf && conversation.adminIds.length === 0 && conversation.memberIds.length) conversation.adminIds = [conversation.memberIds[0]];
    if (conversation.memberIds.length === 0) {
      await Conversation.deleteOne({ _id: conversation._id });
      return jsonResponse({ success: true, memberIds: [], adminIds: [] });
    }
  } else if (action.action === 'admin') {
    if (!isAdmin) return jsonResponse({ error: 'Only a group admin can change admin access.' }, 403);
    const target = new mongoose.Types.ObjectId(action.userId);
    if (!conversation.memberIds.some(id => id.equals(target))) return jsonResponse({ error: 'Member not found.' }, 404);
    if (action.enabled && !conversation.adminIds.some(id => id.equals(target))) conversation.adminIds.push(target);
    if (!action.enabled) {
      if (conversation.adminIds.length === 1 && conversation.adminIds[0].equals(target)) return jsonResponse({ error: 'A group must keep at least one admin.' }, 409);
      conversation.adminIds = conversation.adminIds.filter(id => !id.equals(target));
    }
  } else {
    if (!isAdmin && !conversation.allowMemberEditInfo) return jsonResponse({ error: 'Only a group admin can change group details.' }, 403);
    if (action.title) conversation.title = action.title;
    if (action.description !== undefined) conversation.description = action.description;
    if (action.avatarFileId !== undefined) {
      if (action.avatarFileId) {
        const bucketFiles = mongoose.connection.db?.collection('connect_attachments.files');
        const file = await bucketFiles?.findOne({ _id: new mongoose.Types.ObjectId(action.avatarFileId), 'metadata.conversationId': conversation._id, 'metadata.uploaderId': actorId, 'metadata.verified': true, 'metadata.kind': 'image' });
        if (!file) return jsonResponse({ error: 'Group image is not available.' }, 400);
        if (await Message.exists({ 'attachments.fileId': file._id })) return jsonResponse({ error: 'A shared message attachment cannot also be the group image.' }, 409);
        conversation.avatarFileId = new mongoose.Types.ObjectId(action.avatarFileId);
      } else conversation.avatarFileId = undefined;
    }
    if (isAdmin && action.allowMemberInvites !== undefined) conversation.allowMemberInvites = action.allowMemberInvites;
    if (isAdmin && action.allowMemberEditInfo !== undefined) conversation.allowMemberEditInfo = action.allowMemberEditInfo;
  }
  await conversation.save();
  return jsonResponse({ success: true, memberIds: conversation.memberIds.map(id => id.toString()), adminIds: conversation.adminIds.map(id => id.toString()) });
}
