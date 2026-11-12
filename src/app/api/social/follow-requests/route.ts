import mongoose from 'mongoose';
import { z } from 'zod';
import { notifySocial, requireSocial } from '@/lib/server/social';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { SocialFollow } from '@/models/social-follow';
import { SocialFollowRequest } from '@/models/social-follow-request';
import { SocialProfile } from '@/models/social-profile';
import { User } from '@/models/user';

export const runtime = 'nodejs';
const actionSchema = z.object({ requestId: z.string().regex(/^[a-f\d]{24}$/i), action: z.enum(['accept', 'reject']) }).strict();

export async function GET(request: Request) {
  const gate = await requireSocial(request, 'follow-requests');
  if ('response' in gate) return gate.response;
  const requests = await SocialFollowRequest.find({ recipientId: gate.userId, status: 'pending' }).sort({ createdAt: -1 }).limit(100).lean();
  const requesterIds = requests.map(item => item.requesterId);
  const [profiles, users] = await Promise.all([
    SocialProfile.find({ userId: { $in: requesterIds } }).select('userId username displayName').lean(),
    User.find({ _id: { $in: requesterIds }, status: 'active' }).select('_id').lean(),
  ]);
  const profileMap = new Map(profiles.map(profile => [profile.userId.toString(), profile]));
  const active = new Set(users.map(user => user._id.toString()));
  return jsonResponse({ requests: requests.flatMap(item => {
    const profile = profileMap.get(item.requesterId.toString());
    if (!profile || !active.has(item.requesterId.toString())) return [];
    return [{ id: item._id.toString(), user: { id: profile.userId.toString(), username: profile.username, displayName: profile.displayName }, createdAt: item.createdAt }];
  }) });
}

export async function PATCH(request: Request) {
  const gate = await requireSocial(request, 'follow-request-action', 40);
  if ('response' in gate) return gate.response;
  const parsed = actionSchema.safeParse(await parseJsonBody(request, 2 * 1024));
  if (!parsed.success) return jsonResponse({ error: 'Choose a valid follow request and action.' }, 400);
  const followRequest = await SocialFollowRequest.findOne({ _id: parsed.data.requestId, recipientId: gate.userId, status: 'pending' });
  if (!followRequest) return jsonResponse({ error: 'Follow request not found.' }, 404);
  if (parsed.data.action === 'accept') {
    await SocialFollow.updateOne(
      { followerId: followRequest.requesterId, followingId: gate.userId },
      { $setOnInsert: { followerId: followRequest.requesterId, followingId: gate.userId } },
      { upsert: true },
    );
    followRequest.status = 'accepted';
    await notifySocial({ ownerId: followRequest.requesterId, actorId: gate.userId, type: 'follow_request_accepted', targetId: followRequest._id });
  } else followRequest.status = 'rejected';
  await followRequest.save();
  return jsonResponse({ status: followRequest.status });
}
