import mongoose from 'mongoose';
import { z } from 'zod';
import { requireConnect } from '@/lib/server/connect';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { Conversation } from '@/models/conversation';
import { Message } from '@/models/message';
import { Profile } from '@/models/profile';
import { User } from '@/models/user';

export const runtime = 'nodejs';

const groupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  memberIds: z.array(z.string().regex(/^[a-f\d]{24}$/i).transform(id => id.toLowerCase())).min(1).max(49),
});

export async function GET(request: Request) {
  const gate = await requireConnect(request, 'conversation-list', 120);
  if ('response' in gate) return gate.response;
  const userId = new mongoose.Types.ObjectId(gate.context.user.id);
  const conversations = await Conversation.find({ memberIds: userId }).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(100).lean();
  const otherIds = [...new Set(conversations.flatMap(item => item.memberIds.filter(id => !id.equals(userId)).map(id => id.toString())))];
  const peers = await User.find({ _id: { $in: otherIds } }).select('_id fullName').lean();
  const profiles = await Profile.find({ userId: { $in: otherIds } }).select('userId displayName avatarUrl').lean();
  const peerMap = new Map(peers.map(item => [item._id.toString(), item]));
  const profileMap = new Map(profiles.map(item => [item.userId.toString(), item]));
  const onlineIds = await (await import('@/models/presence')).Presence.find({ userId: { $in: otherIds }, expiresAt: { $gt: new Date() } }).distinct('userId');
  const onlineSet = new Set(onlineIds.map(id => id.toString()));
  const unread = await Message.aggregate([
    { $match: { conversationId: { $in: conversations.map(item => item._id) }, senderId: { $ne: userId }, readBy: { $not: { $elemMatch: { userId } } }, deletedForEveryoneAt: { $exists: false }, deletedFor: { $ne: userId } } },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } },
  ]);
  const unreadMap = new Map(unread.map(item => [item._id.toString(), item.count]));
  return jsonResponse({ conversations: conversations.map(conversation => {
    const others = conversation.memberIds.filter(id => !id.equals(userId)).map(id => {
      const peer = peerMap.get(id.toString());
      const profile = profileMap.get(id.toString());
      return { id: id.toString(), name: profile?.displayName ?? peer?.fullName ?? 'Former member', avatarUrl: profile?.avatarUrl, online: onlineSet.has(id.toString()) };
    });
    const name = conversation.type === 'group' ? conversation.title : others[0]?.name ?? 'Conversation';
    return {
      id: conversation._id.toString(), type: conversation.type, name,
      description: conversation.description, avatarFileId: conversation.avatarFileId?.toString(),
      members: others, memberCount: conversation.memberIds.length, adminIds: conversation.adminIds.map(id => id.toString()),
      allowMemberInvites: conversation.allowMemberInvites, allowMemberEditInfo: conversation.allowMemberEditInfo,
      lastMessageAt: conversation.lastMessageAt, lastMessageText: conversation.lastMessageText,
      lastMessageSenderId: conversation.lastMessageSenderId?.toString(), unreadCount: unreadMap.get(conversation._id.toString()) ?? 0,
    };
  }) });
}

export async function POST(request: Request) {
  const gate = await requireConnect(request, 'group-create', 12);
  if ('response' in gate) return gate.response;
  const parsed = groupSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return jsonResponse({ error: 'Add a group name and at least one other member.' }, 400);
  const actorId = new mongoose.Types.ObjectId(gate.context.user.id);
  const memberIds = [...new Set(parsed.data.memberIds)].filter(id => id !== gate.context.user.id).map(id => new mongoose.Types.ObjectId(id));
  if (memberIds.length < 1 || memberIds.length > 49) return jsonResponse({ error: 'A group needs 2 to 50 members.' }, 400);
  const activeUsers = await User.countDocuments({ _id: { $in: memberIds }, status: 'active' });
  if (activeUsers !== memberIds.length) return jsonResponse({ error: 'One or more members could not be found.' }, 400);
  const conversation = await Conversation.create({
    type: 'group', memberIds: [actorId, ...memberIds], title: parsed.data.name,
    description: parsed.data.description, createdBy: actorId, adminIds: [actorId],
  });
  return jsonResponse({ conversationId: conversation._id.toString() }, 201);
}
