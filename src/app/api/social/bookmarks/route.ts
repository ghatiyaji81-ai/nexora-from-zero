import { canViewSocialPost, requireSocial } from '@/lib/server/social';
import { jsonResponse } from '@/lib/server/http';
import { SocialBookmark } from '@/models/social-bookmark';
import { SocialPost } from '@/models/social-post';
import { SocialProfile } from '@/models/social-profile';
import { SocialReaction } from '@/models/social-reaction';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireSocial(request, 'bookmark-list');
  if ('response' in gate) return gate.response;
  const saved = await SocialBookmark.find({ ownerId: gate.userId }).sort({ createdAt: -1 }).limit(100).lean();
  const posts = await SocialPost.find({ _id: { $in: saved.map(item => item.postId) } }).lean();
  const postById = new Map(posts.map(post => [post._id.toString(), post]));
  const visible: typeof posts = [];
  for (const bookmark of saved) {
    const post = postById.get(bookmark.postId.toString());
    if (post && await canViewSocialPost(gate.userId, post)) visible.push(post);
  }
  const [profiles, likedIds] = await Promise.all([
    SocialProfile.find({ userId: { $in: visible.map(post => post.ownerId) } }).select('userId username displayName').lean(),
    SocialReaction.find({ ownerId: gate.userId, postId: { $in: visible.map(post => post._id) } }).distinct('postId'),
  ]);
  const profileMap = new Map(profiles.map(profile => [profile.userId.toString(), profile]));
  const liked = new Set(likedIds.map(id => id.toString()));
  return jsonResponse({ posts: visible.map(post => {
    const author = profileMap.get(post.ownerId.toString());
    return {
      id: post._id.toString(), author: author ? { id: post.ownerId.toString(), username: author.username, displayName: author.displayName } : null,
      body: post.body, audience: post.audience, commentsEnabled: post.commentsEnabled, pinned: post.pinned,
      likeCount: post.likeCount, commentCount: post.commentCount, liked: liked.has(post._id.toString()), bookmarked: true,
      createdAt: post.createdAt,
    };
  }) });
}
