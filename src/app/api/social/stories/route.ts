import { z } from 'zod';
import { ensureSocialProfile, requireSocial } from '@/lib/server/social';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { SocialBlock } from '@/models/social-block';
import { SocialFollow } from '@/models/social-follow';
import { SocialProfile } from '@/models/social-profile';
import { SocialStory } from '@/models/social-story';
import { User } from '@/models/user';
import { isSocialStoryActive } from '@/lib/social-visibility';

export const runtime = 'nodejs';
const createSchema = z.object({ body: z.string().trim().min(1).max(500), audience: z.enum(['public', 'followers']).default('public') }).strict();

export async function GET(request: Request) {
  const gate = await requireSocial(request, 'story-list');
  if ('response' in gate) return gate.response;
  const following = await SocialFollow.distinct('followingId', { followerId: gate.userId });
  const blocks = await SocialBlock.find({ $or: [{ blockerId: gate.userId }, { blockedId: gate.userId }] }).select('blockerId blockedId').lean();
  const blockedIds = blocks.map(item => item.blockerId.equals(gate.userId) ? item.blockedId : item.blockerId);
  const now = new Date();
  const stories = await SocialStory.find({
    expiresAt: { $gt: now },
    $or: [{ ownerId: gate.userId }, { audience: 'public' }, { ownerId: { $in: following }, audience: 'followers' }],
    ...(blockedIds.length ? { ownerId: { $nin: blockedIds } } : {}),
  }).sort({ createdAt: -1 }).limit(100).lean();
  const ids = [...new Map(stories.map(item => [item.ownerId.toString(), item.ownerId])).values()];
  const [profiles, activeUsers] = await Promise.all([
    SocialProfile.find({ userId: { $in: ids } }).select('userId username displayName visibility').lean(),
    User.find({ _id: { $in: ids }, status: 'active' }).select('_id').lean(),
  ]);
  const profileMap = new Map(profiles.map(item => [item.userId.toString(), item]));
  const active = new Set(activeUsers.map(item => item._id.toString()));
  const followed = new Set(following.map(id => id.toString()));
  return jsonResponse({ stories: stories.flatMap(story => {
    const owner = story.ownerId.toString();
    const profile = profileMap.get(owner);
    if (!isSocialStoryActive(story.expiresAt, now) || !active.has(owner) || !profile || (profile.visibility === 'private' && !followed.has(owner)) ||
      (story.audience === 'followers' && !followed.has(owner))) return [];
    return [{ id: story._id.toString(), body: story.body, audience: story.audience, expiresAt: story.expiresAt, createdAt: story.createdAt,
      author: { id: owner, username: profile.username, displayName: profile.displayName } }];
  }) });
}

export async function POST(request: Request) {
  const gate = await requireSocial(request, 'story-create', 12);
  if ('response' in gate) return gate.response;
  const parsed = createSchema.safeParse(await parseJsonBody(request, 2 * 1024));
  if (!parsed.success) return jsonResponse({ error: 'Write a story up to 500 characters and choose an audience.' }, 400);
  const profile = await ensureSocialProfile(gate.userId, gate.context.profile?.displayName ?? gate.context.user.fullName);
  if (parsed.data.audience === 'public' && profile.visibility === 'private') return jsonResponse({ error: 'Private profiles can publish stories to followers only.' }, 400);
  const story = await SocialStory.create({ ownerId: gate.userId, ...parsed.data, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  return jsonResponse({ story: { id: story._id.toString(), body: story.body, audience: story.audience, createdAt: story.createdAt, expiresAt: story.expiresAt } }, 201);
}
