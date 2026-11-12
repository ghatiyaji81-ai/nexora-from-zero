import mongoose from 'mongoose';
import { z } from 'zod';
import { canViewSocialPost, hasSocialBlockBetween, requireSocial } from '@/lib/server/social';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { SocialComment } from '@/models/social-comment';
import { SocialPost } from '@/models/social-post';

export const runtime = 'nodejs';
type Context = { params: Promise<{ postId: string }> };
const updateSchema = z.object({
  body: z.string().trim().min(1).max(5000).optional(),
  audience: z.enum(['public', 'followers']).optional(),
  commentsEnabled: z.boolean().optional(),
  pinned: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0);

export async function PATCH(request: Request, route: Context) {
  const gate = await requireSocial(request, 'post-update', 30);
  if ('response' in gate) return gate.response;
  const { postId } = await route.params;
  const parsed = updateSchema.safeParse(await parseJsonBody(request));
  if (!mongoose.isValidObjectId(postId) || !parsed.success) return jsonResponse({ error: 'The post update is invalid.' }, 400);
  const post = await SocialPost.findOne({ _id: postId, ownerId: gate.userId });
  if (!post) return jsonResponse({ error: 'Post not found.' }, 404);
  if (parsed.data.audience === 'public') {
    const profile = await (await import('@/models/social-profile')).SocialProfile.findOne({ userId: gate.userId }).select('visibility').lean();
    if (profile?.visibility === 'private') return jsonResponse({ error: 'Private profiles can publish to followers only.' }, 400);
  }
  if (parsed.data.body !== undefined) {
    post.body = parsed.data.body;
    post.editedAt = new Date();
  }
  if (parsed.data.audience !== undefined) post.audience = parsed.data.audience;
  if (parsed.data.commentsEnabled !== undefined) post.commentsEnabled = parsed.data.commentsEnabled;
  if (parsed.data.pinned !== undefined) post.pinned = parsed.data.pinned;
  await post.save();
  return jsonResponse({ post: { id: post._id.toString(), body: post.body, audience: post.audience, commentsEnabled: post.commentsEnabled, pinned: post.pinned, updatedAt: post.updatedAt } });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireSocial(request, 'post-delete', 25);
  if ('response' in gate) return gate.response;
  const { postId } = await route.params;
  if (!mongoose.isValidObjectId(postId)) return jsonResponse({ error: 'Post not found.' }, 404);
  const post = await SocialPost.findOneAndDelete({ _id: postId, ownerId: gate.userId });
  if (!post) return jsonResponse({ error: 'Post not found.' }, 404);
  const [{ SocialReaction }, { SocialBookmark }] = await Promise.all([
    import('@/models/social-reaction'), import('@/models/social-bookmark'),
  ]);
  await Promise.all([
    SocialComment.deleteMany({ postId: post._id }),
    SocialReaction.deleteMany({ postId: post._id }),
    SocialBookmark.deleteMany({ postId: post._id }),
  ]);
  return jsonResponse({ success: true });
}
