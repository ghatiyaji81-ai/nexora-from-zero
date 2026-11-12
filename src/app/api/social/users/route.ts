import mongoose from 'mongoose';
import { requireSocial } from '@/lib/server/social';
import { jsonResponse } from '@/lib/server/http';
import { SocialBlock } from '@/models/social-block';
import { SocialFollow } from '@/models/social-follow';
import { SocialFollowRequest } from '@/models/social-follow-request';
import { SocialProfile } from '@/models/social-profile';
import { SocialPost } from '@/models/social-post';
import { User } from '@/models/user';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireSocial(request, 'user-search', 60);
  if ('response' in gate) return gate.response;
  const query = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() ?? '';
  if (query.length < 2) return jsonResponse({ users: [] });
  const patterns = query.split(/\s+/).slice(0, 4).map(escapeRegex);
  const profiles = await SocialProfile.find({
    userId: { $ne: gate.userId },
    visibility: 'public',
    $and: patterns.map(term => ({ $or: [{ username: { $regex: term, $options: 'i' } }, { displayName: { $regex: term, $options: 'i' } }] })),
  }).sort({ updatedAt: -1 }).limit(25).select('-website -location').lean();
  const [blocks, follows, requests] = await Promise.all([
    SocialBlock.find({ $or: [{ blockerId: gate.userId }, { blockedId: gate.userId }] }).select('blockerId blockedId').lean(),
    SocialFollow.find({ followerId: gate.userId, followingId: { $in: profiles.map(profile => profile.userId) } }).select('followingId').lean(),
    SocialFollowRequest.find({ requesterId: gate.userId, recipientId: { $in: profiles.map(profile => profile.userId) }, status: 'pending' }).select('recipientId').lean(),
  ]);
  const blocked = new Set(blocks.flatMap(item => [item.blockerId.toString(), item.blockedId.toString()]));
  const users = profiles.filter(profile => !blocked.has(profile.userId.toString()));
  const followingSet = new Set(follows.map(item => item.followingId.toString()));
  const requestSet = new Set(requests.map(item => item.recipientId.toString()));
  const userRecords = await User.find({ _id: { $in: users.map(profile => profile.userId) }, status: 'active' }).select('_id').lean();
  const active = new Set(userRecords.map(user => user._id.toString()));
  return jsonResponse({ users: users.filter(profile => active.has(profile.userId.toString())).map(profile => ({
    id: profile.userId.toString(), username: profile.username, displayName: profile.displayName,
    bio: profile.bio, visibility: profile.visibility,
    following: followingSet.has(profile.userId.toString()), requestPending: requestSet.has(profile.userId.toString()),
  })) });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
