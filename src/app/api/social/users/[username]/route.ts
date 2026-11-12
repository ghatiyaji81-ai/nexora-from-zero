import mongoose from 'mongoose';
import { canViewSocialProfile, hasSocialBlockBetween, requireSocial } from '@/lib/server/social';
import { jsonResponse } from '@/lib/server/http';
import { SocialFollow } from '@/models/social-follow';
import { SocialFollowRequest } from '@/models/social-follow-request';
import { SocialPost } from '@/models/social-post';
import { SocialProfile } from '@/models/social-profile';
import { User } from '@/models/user';

export const runtime = 'nodejs';
type Context = { params: Promise<{ username: string }> };

export async function GET(request: Request, route: Context) {
  const gate = await requireSocial(request, 'profile-read');
  if ('response' in gate) return gate.response;
  const { username } = await route.params;
  const profile = await SocialProfile.findOne({ username: username.toLowerCase() }).lean();
  if (!profile || !await User.exists({ _id: profile.userId, status: 'active' }) || await hasSocialBlockBetween(gate.userId, profile.userId)) {
    return jsonResponse({ error: 'Profile not found.' }, 404);
  }
  const canView = await canViewSocialProfile(gate.userId, profile.userId, profile.visibility);
  const [followersCount, followingCount, postCount, following, requestPending] = await Promise.all([
    SocialFollow.countDocuments({ followingId: profile.userId }),
    SocialFollow.countDocuments({ followerId: profile.userId }),
    SocialPost.countDocuments({ ownerId: profile.userId }),
    SocialFollow.exists({ followerId: gate.userId, followingId: profile.userId }),
    SocialFollowRequest.exists({ requesterId: gate.userId, recipientId: profile.userId, status: 'pending' }),
  ]);
  const posts = canView ? await SocialPost.find({
    ownerId: profile.userId,
    ...(profile.userId.equals(gate.userId) || following ? {} : { audience: 'public' }),
  }).sort({ pinned: -1, createdAt: -1 }).limit(20).select('-ownerId').lean() : [];
  return jsonResponse({
    profile: {
      id: profile.userId.toString(), username: profile.username, displayName: profile.displayName,
      bio: canView ? profile.bio : '', website: canView ? profile.website ?? null : null,
      location: canView ? profile.location ?? null : null, interests: canView ? profile.interests : [],
      visibility: profile.visibility, followersCount, followingCount, postCount,
      isSelf: profile.userId.equals(gate.userId), following: Boolean(following), requestPending: Boolean(requestPending),
      createdAt: profile.createdAt,
    },
    private: !canView,
    posts: posts.map(post => ({
      id: post._id.toString(), body: post.body, audience: post.audience, likeCount: post.likeCount,
      commentCount: post.commentCount, pinned: post.pinned, createdAt: post.createdAt,
    })),
  });
}
