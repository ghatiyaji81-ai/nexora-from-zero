import mongoose from 'mongoose';
import { requireSocial, notifySocial } from '@/lib/server/social';
import { jsonResponse } from '@/lib/server/http';
import { SocialPost } from '@/models/social-post';
import { SocialReaction } from '@/models/social-reaction';

export const runtime = 'nodejs';
type Context = { params: Promise<{ postId: string }> };

export async function POST(request: Request, route: Context) {
  const gate = await requireSocial(request, 'post-like', 120);
  if ('response' in gate) return gate.response;
  const { postId } = await route.params;
  if (!mongoose.isValidObjectId(postId)) return jsonResponse({ error: 'Post not found.' }, 404);
  const post = await SocialPost.findById(postId).select('ownerId audience').lean();
  if (!post) return jsonResponse({ error: 'Post not found.' }, 404);
  const { canViewSocialPost } = await import('@/lib/server/social');
  if (!await canViewSocialPost(gate.userId, post)) return jsonResponse({ error: 'Post not found.' }, 404);
  try {
    await SocialReaction.create({ postId: post._id, ownerId: gate.userId });
    await SocialPost.updateOne({ _id: post._id }, { $inc: { likeCount: 1 } });
    await notifySocial({ ownerId: post.ownerId, actorId: gate.userId, type: 'like', targetId: post._id });
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error;
  }
  const current = await SocialPost.findById(post._id).select('likeCount').lean();
  return jsonResponse({ liked: true, likeCount: current?.likeCount ?? 0 });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireSocial(request, 'post-like', 120);
  if ('response' in gate) return gate.response;
  const { postId } = await route.params;
  if (!mongoose.isValidObjectId(postId)) return jsonResponse({ error: 'Post not found.' }, 404);
  const post = await SocialPost.findById(postId).select('ownerId likeCount').lean();
  if (!post) return jsonResponse({ error: 'Post not found.' }, 404);
  const deleted = await SocialReaction.deleteOne({ postId: post._id, ownerId: gate.userId });
  if (deleted.deletedCount) await SocialPost.updateOne({ _id: post._id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
  const current = await SocialPost.findById(post._id).select('likeCount').lean();
  return jsonResponse({ liked: false, likeCount: current?.likeCount ?? 0 });
}
