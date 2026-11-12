import mongoose from 'mongoose';
import { z } from 'zod';
import { ensureSocialProfile, requireSocial } from '@/lib/server/social';
import { SocialBookmark } from '@/models/social-bookmark';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { SocialBlock } from '@/models/social-block';
import { SocialFollow } from '@/models/social-follow';
import { SocialPost } from '@/models/social-post';
import { SocialProfile } from '@/models/social-profile';
import { SocialReaction } from '@/models/social-reaction';
import { User } from '@/models/user';
import { canShowSocialPost } from '@/lib/social-visibility';

export const runtime = 'nodejs';
const createSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  audience: z.enum(['public', 'followers']).default('public'),
  commentsEnabled: z.boolean().default(true),
}).strict();
const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const gate = await requireSocial(request, 'feed-read', 120);
  if ('response' in gate) return gate.response;
  const params = new URL(request.url).searchParams;
  const requestedMode = params.get('mode') ?? 'following';
  if (requestedMode !== 'following' && requestedMode !== 'latest') return jsonResponse({ error: 'Choose Following or Latest.' }, 400);
  const mode: 'following' | 'latest' = requestedMode;
  const cursor = decodeCursor(params.get('cursor'));
  if (params.get('cursor') && !cursor) return jsonResponse({ error: 'The feed cursor is invalid.' }, 400);
  const followingIds = await SocialFollow.distinct('followingId', { followerId: gate.userId });
  const blockRecords = await SocialBlock.find({ $or: [{ blockerId: gate.userId }, { blockedId: gate.userId }] }).select('blockerId blockedId').lean();
  const blockedIds = blockRecords.flatMap(item => item.blockerId.equals(gate.userId) ? [item.blockedId] : [item.blockerId]);
  const base: Record<string, unknown> = {
    $or: [
      { ownerId: gate.userId },
      { audience: 'public' },
      { ownerId: { $in: followingIds }, audience: 'followers' },
    ],
    ...(blockedIds.length ? { ownerId: { $nin: blockedIds } } : {}),
  };
  if (mode === 'following') {
    base.$or = [
      { ownerId: gate.userId },
      { ownerId: { $in: followingIds }, audience: { $in: ['public', 'followers'] } },
    ];
  }
  if (cursor) {
    base.$and = [{ $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }] }];
  }
  const candidates = await SocialPost.find(base).sort({ createdAt: -1, _id: -1 }).limit(PAGE_SIZE * 4).select('-__v').lean();
  const authorIds = [...new Map(candidates.map(post => [post.ownerId.toString(), post.ownerId])).values()];
  const [profiles, activeUsers] = await Promise.all([
    SocialProfile.find({ userId: { $in: authorIds } }).select('userId username displayName visibility').lean(),
    User.find({ _id: { $in: authorIds }, status: 'active' }).select('_id').lean(),
  ]);
  const profileById = new Map(profiles.map(profile => [profile.userId.toString(), profile]));
  const active = new Set(activeUsers.map(user => user._id.toString()));
  const followed = new Set(followingIds.map(id => id.toString()));
  const visible = candidates.filter(post => {
    const authorId = post.ownerId.toString();
    const profile = profileById.get(authorId);
    if (!profile) return false;
    return canShowSocialPost({
      viewerId: gate.userId.toString(), ownerId: authorId,
      authorVisibility: profile.visibility, audience: post.audience,
      isFollowing: followed.has(authorId),
      isBlocked: blockedIds.some(id => id.equals(post.ownerId)),
      isActive: active.has(authorId), feed: mode,
    });
  }).slice(0, PAGE_SIZE);
  const postIds = visible.map(post => post._id);
  const [likedIds, bookmarkedIds] = await Promise.all([
    SocialReaction.find({ ownerId: gate.userId, postId: { $in: postIds } }).distinct('postId'),
    SocialBookmark.find({ ownerId: gate.userId, postId: { $in: postIds } }).distinct('postId'),
  ]);
  const liked = new Set(likedIds.map(id => id.toString()));
  const bookmarked = new Set(bookmarkedIds.map(id => id.toString()));
  const last = visible.at(-1);
  return jsonResponse({
    posts: visible.map(post => {
      const author = profileById.get(post.ownerId.toString())!;
      return {
        id: post._id.toString(), author: { id: post.ownerId.toString(), username: author.username, displayName: author.displayName },
        body: post.body, audience: post.audience, commentsEnabled: post.commentsEnabled, pinned: post.pinned,
        likeCount: post.likeCount, commentCount: post.commentCount, liked: liked.has(post._id.toString()),
        bookmarked: bookmarked.has(post._id.toString()), createdAt: post.createdAt, editedAt: post.editedAt ?? null,
      };
    }),
    nextCursor: candidates.length === PAGE_SIZE * 4
      ? encodeCursor(visible.length >= PAGE_SIZE ? visible[PAGE_SIZE - 1].createdAt : candidates.at(-1)!.createdAt, visible.length >= PAGE_SIZE ? visible[PAGE_SIZE - 1]._id : candidates.at(-1)!._id)
      : visible.length === PAGE_SIZE && last ? encodeCursor(last.createdAt, last._id) : null,
    mode,
  });
}

export async function POST(request: Request) {
  const gate = await requireSocial(request, 'post-create', 20);
  if ('response' in gate) return gate.response;
  const parsed = createSchema.safeParse(await parseJsonBody(request, 8 * 1024));
  if (!parsed.success) return jsonResponse({ error: 'Write a post up to 5,000 characters and choose an audience.' }, 400);
  const profile = await ensureSocialProfile(gate.userId, gate.context.profile?.displayName ?? gate.context.user.fullName);
  if (parsed.data.audience === 'public' && profile.visibility === 'private') {
    return jsonResponse({ error: 'Private profiles can publish to followers only.' }, 400);
  }
  const post = await SocialPost.create({
    ownerId: gate.userId, body: parsed.data.body, audience: parsed.data.audience, commentsEnabled: parsed.data.commentsEnabled,
  });
  return jsonResponse({
    post: {
      id: post._id.toString(), author: { id: gate.userId.toString(), username: profile.username, displayName: profile.displayName },
      body: post.body, audience: post.audience, commentsEnabled: post.commentsEnabled, pinned: post.pinned,
      likeCount: 0, commentCount: 0, liked: false, bookmarked: false, createdAt: post.createdAt, editedAt: null,
    },
  }, 201);
}

function encodeCursor(createdAt: Date, id: { toString(): string }) {
  return Buffer.from(`${createdAt.toISOString()}|${id.toString()}`).toString('base64url');
}

function decodeCursor(value: string | null) {
  if (!value || value.length > 128) return null;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const [date, id, ...extra] = decoded.split('|');
    if (extra.length || Number.isNaN(Date.parse(date)) || !mongoose.isValidObjectId(id)) return null;
    return { createdAt: new Date(date), id: new mongoose.Types.ObjectId(id) };
  } catch {
    return null;
  }
}
