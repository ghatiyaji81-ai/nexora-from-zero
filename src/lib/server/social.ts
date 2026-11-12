import 'server-only';
import mongoose from 'mongoose';
import { getAuthenticatedContext } from '@/lib/server/auth-session';
import { consumeRateLimit } from '@/lib/server/auth-rate-limit';
import { connectToDatabase } from '@/lib/server/db';
import { jsonResponse, requestIsSameOrigin } from '@/lib/server/http';
import { SocialBlock } from '@/models/social-block';
import { SocialFollow } from '@/models/social-follow';
import { SocialProfile } from '@/models/social-profile';
import { SocialPost } from '@/models/social-post';
import { User } from '@/models/user';

export async function requireSocial(request: Request, scope: string, limit = 60) {
  const context = await getAuthenticatedContext();
  if (!context) return { response: jsonResponse({ error: 'Sign in to use SOCIAL.' }, 401) };
  if (request.method !== 'GET' && !requestIsSameOrigin(request)) {
    return { response: jsonResponse({ error: 'Request origin could not be verified.' }, 403) };
  }
  await connectToDatabase();
  const budget = await consumeRateLimit(request, `social:${scope}`, limit, 60_000, context.user.id);
  if (!budget.allowed) {
    return { response: jsonResponse({ error: 'You are doing that too often. Try again shortly.' }, 429, { 'Retry-After': String(budget.retryAfterSeconds) }) };
  }
  return { context, userId: new mongoose.Types.ObjectId(context.user.id) };
}

export async function ensureSocialProfile(userId: mongoose.Types.ObjectId, fullName: string) {
  let profile = await SocialProfile.findOne({ userId });
  if (profile) return profile;
  const base = slug(fullName) || 'member';
  const username = `${base}-${userId.toString().slice(-6)}`.slice(0, 30);
  try {
    profile = await SocialProfile.create({ userId, username, displayName: fullName });
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error;
    profile = await SocialProfile.findOne({ userId });
    if (!profile) throw error;
  }
  return profile;
}

export async function hasSocialBlockBetween(first: mongoose.Types.ObjectId, second: mongoose.Types.ObjectId) {
  return Boolean(await SocialBlock.exists({
    $or: [{ blockerId: first, blockedId: second }, { blockerId: second, blockedId: first }],
  }));
}

export async function canViewSocialProfile(viewerId: mongoose.Types.ObjectId, profileUserId: mongoose.Types.ObjectId, visibility: 'public' | 'private') {
  if (viewerId.equals(profileUserId)) return true;
  if (await hasSocialBlockBetween(viewerId, profileUserId)) return false;
  if (visibility === 'public') return true;
  return Boolean(await SocialFollow.exists({ followerId: viewerId, followingId: profileUserId }));
}

export async function canViewSocialPost(viewerId: mongoose.Types.ObjectId, post: {
  ownerId: mongoose.Types.ObjectId;
  audience: 'public' | 'followers';
}) {
  if (viewerId.equals(post.ownerId)) return true;
  if (await hasSocialBlockBetween(viewerId, post.ownerId)) return false;
  if (!await User.exists({ _id: post.ownerId, status: 'active' })) return false;
  const profile = await SocialProfile.findOne({ userId: post.ownerId }).select('visibility').lean();
  if (!profile || profile.visibility === 'private') {
    return Boolean(await SocialFollow.exists({ followerId: viewerId, followingId: post.ownerId }));
  }
  if (post.audience === 'public') return true;
  return Boolean(await SocialFollow.exists({ followerId: viewerId, followingId: post.ownerId }));
}

export async function visiblePostFilter(viewerId: mongoose.Types.ObjectId) {
  const [following, blocked] = await Promise.all([
    SocialFollow.distinct('followingId', { followerId: viewerId }),
    SocialBlock.find({ $or: [{ blockerId: viewerId }, { blockedId: viewerId }] }).select('blockerId blockedId').lean(),
  ]);
  const blockedIds = [...new Set(blocked.flatMap(item => [
    item.blockerId.toString() === viewerId.toString() ? item.blockedId.toString() : '',
    item.blockedId.toString() === viewerId.toString() ? item.blockerId.toString() : '',
  ]).filter(Boolean))].map(id => new mongoose.Types.ObjectId(id));
  const profiles = await SocialProfile.find({ userId: { $in: following }, visibility: 'private' }).select('userId').lean();
  const privateFollowing = profiles.map(item => item.userId);
  return {
    followingIds: following,
    blockedIds,
    filter: {
      $or: [
        { ownerId: viewerId },
        { ownerId: { $in: following }, audience: 'followers' },
        { ownerId: { $in: following.filter(id => !privateFollowing.some(privateId => privateId.equals(id))) }, audience: 'public' },
        { ownerId: { $nin: [...following, ...blockedIds, viewerId] }, audience: 'public' },
      ],
      ...(blockedIds.length ? { ownerId: { $nin: blockedIds } } : {}),
    },
  };
}

export async function notifySocial(input: {
  ownerId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  type: 'follow' | 'follow_request' | 'like' | 'comment' | 'story_reply' | 'follow_request_accepted';
  targetId?: mongoose.Types.ObjectId;
}) {
  if (input.ownerId.equals(input.actorId)) return;
  const { SocialNotification } = await import('@/models/social-notification');
  const key = `${input.type}:${input.actorId}:${input.targetId ?? ''}`;
  await SocialNotification.updateOne(
    { ownerId: input.ownerId, eventKey: key },
    { $setOnInsert: { ...input, eventKey: key, readAt: undefined } },
    { upsert: true },
  );
}

function slug(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 22);
}
