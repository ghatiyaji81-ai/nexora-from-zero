import mongoose from 'mongoose';
import { z } from 'zod';
import { canViewSocialPost, notifySocial, requireSocial } from '@/lib/server/social';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { SocialComment } from '@/models/social-comment';
import { SocialPost } from '@/models/social-post';
import { SocialProfile } from '@/models/social-profile';

export const runtime = 'nodejs';
type Context = { params: Promise<{ postId: string }> };
const commentSchema = z.object({ body: z.string().trim().min(1).max(2000), replyTo: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict();

export async function GET(request: Request, route: Context) {
  const gate = await requireSocial(request, 'comment-list', 120);
  if ('response' in gate) return gate.response;
  const { postId } = await route.params;
  if (!mongoose.isValidObjectId(postId)) return jsonResponse({ error: 'Post not found.' }, 404);
  const post = await SocialPost.findById(postId).select('ownerId audience commentsEnabled').lean();
  if (!post || !await canViewSocialPost(gate.userId, post)) return jsonResponse({ error: 'Post not found.' }, 404);
  const comments = await SocialComment.find({ postId: post._id }).sort({ createdAt: 1, _id: 1 }).limit(100).lean();
  const profileIds = [...new Map(comments.map(comment => [comment.ownerId.toString(), comment.ownerId])).values()];
  const profiles = await SocialProfile.find({ userId: { $in: profileIds } }).select('userId username displayName').lean();
  const profileMap = new Map(profiles.map(profile => [profile.userId.toString(), profile]));
  return jsonResponse({ comments: comments.map(comment => ({
    id: comment._id.toString(), postId: comment.postId.toString(), body: comment.body,
    replyTo: comment.replyTo?.toString() ?? null,
    author: profileMap.get(comment.ownerId.toString()) ? {
      id: comment.ownerId.toString(), username: profileMap.get(comment.ownerId.toString())!.username,
      displayName: profileMap.get(comment.ownerId.toString())!.displayName,
    } : null,
    createdAt: comment.createdAt, editedAt: comment.updatedAt.getTime() > comment.createdAt.getTime() ? comment.updatedAt : null,
  })) });
}

export async function POST(request: Request, route: Context) {
  const gate = await requireSocial(request, 'comment-create', 60);
  if ('response' in gate) return gate.response;
  const { postId } = await route.params;
  const parsed = commentSchema.safeParse(await parseJsonBody(request, 4 * 1024));
  if (!mongoose.isValidObjectId(postId) || !parsed.success) return jsonResponse({ error: 'The comment is invalid.' }, 400);
  const post = await SocialPost.findById(postId);
  if (!post || !await canViewSocialPost(gate.userId, post) || !post.commentsEnabled) return jsonResponse({ error: 'Comments are unavailable for this post.' }, 404);
  let replyTo: mongoose.Types.ObjectId | undefined;
  if (parsed.data.replyTo) {
    replyTo = new mongoose.Types.ObjectId(parsed.data.replyTo);
    if (!await SocialComment.exists({ _id: replyTo, postId: post._id })) return jsonResponse({ error: 'The replied-to comment is unavailable.' }, 400);
  }
  const [comment] = await Promise.all([
    SocialComment.create({ postId: post._id, ownerId: gate.userId, body: parsed.data.body, replyTo }),
    SocialPost.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } }),
  ]);
  await notifySocial({ ownerId: post.ownerId, actorId: gate.userId, type: 'comment', targetId: post._id });
  return jsonResponse({ comment: { id: comment._id.toString(), postId: post._id.toString(), body: comment.body, replyTo: comment.replyTo?.toString() ?? null, createdAt: comment.createdAt } }, 201);
}
