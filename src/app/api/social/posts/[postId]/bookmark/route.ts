import mongoose from 'mongoose';
import { canViewSocialPost, requireSocial } from '@/lib/server/social';
import { jsonResponse } from '@/lib/server/http';
import { SocialBookmark } from '@/models/social-bookmark';
import { SocialPost } from '@/models/social-post';

export const runtime = 'nodejs';
type Context = { params: Promise<{ postId: string }> };

export async function POST(request: Request, route: Context) {
  const gate = await requireSocial(request, 'bookmark-write', 60);
  if ('response' in gate) return gate.response;
  const { postId } = await route.params;
  if (!mongoose.isValidObjectId(postId)) return jsonResponse({ error: 'Post not found.' }, 404);
  const post = await SocialPost.findById(postId).lean();
  if (!post || !await canViewSocialPost(gate.userId, post)) return jsonResponse({ error: 'Post not found.' }, 404);
  await SocialBookmark.updateOne({ ownerId: gate.userId, postId: post._id }, { $setOnInsert: { ownerId: gate.userId, postId: post._id } }, { upsert: true });
  return jsonResponse({ bookmarked: true });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireSocial(request, 'bookmark-write', 60);
  if ('response' in gate) return gate.response;
  const { postId } = await route.params;
  if (!mongoose.isValidObjectId(postId)) return jsonResponse({ error: 'Post not found.' }, 404);
  await SocialBookmark.deleteOne({ ownerId: gate.userId, postId });
  return jsonResponse({ bookmarked: false });
}
