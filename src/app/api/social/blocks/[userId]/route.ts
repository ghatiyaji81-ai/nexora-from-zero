import mongoose from 'mongoose';
import { z } from 'zod';
import { requireSocial } from '@/lib/server/social';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { SocialBlock } from '@/models/social-block';
import { SocialFollow } from '@/models/social-follow';
import { SocialFollowRequest } from '@/models/social-follow-request';
import { User } from '@/models/user';

export const runtime = 'nodejs';
type Context = { params: Promise<{ userId: string }> };
const blockSchema = z.object({ blocked: z.literal(true) }).strict();

export async function GET(request: Request, route: Context) {
  const gate = await requireSocial(request, 'block-read');
  if ('response' in gate) return gate.response;
  const { userId } = await route.params;
  if (!mongoose.isValidObjectId(userId)) return jsonResponse({ blocked: false });
  return jsonResponse({ blocked: Boolean(await SocialBlock.exists({ blockerId: gate.userId, blockedId: userId })) });
}

export async function POST(request: Request, route: Context) {
  const gate = await requireSocial(request, 'block-create', 30);
  if ('response' in gate) return gate.response;
  const { userId } = await route.params;
  const parsed = blockSchema.safeParse(await parseJsonBody(request, 1024));
  if (!parsed.success || !mongoose.isValidObjectId(userId) || gate.userId.toString() === userId) return jsonResponse({ error: 'Choose a valid account to block.' }, 400);
  const exists = await User.exists({ _id: userId, status: 'active' });
  if (!exists) return jsonResponse({ error: 'Profile not found.' }, 404);
  await SocialBlock.updateOne({ blockerId: gate.userId, blockedId: userId }, { $setOnInsert: { blockerId: gate.userId, blockedId: userId } }, { upsert: true });
  const targetId = new mongoose.Types.ObjectId(userId);
  await Promise.all([
    SocialFollow.deleteMany({ $or: [{ followerId: gate.userId, followingId: targetId }, { followerId: targetId, followingId: gate.userId }] }),
    SocialFollowRequest.deleteMany({ $or: [{ requesterId: gate.userId, recipientId: targetId }, { requesterId: targetId, recipientId: gate.userId }] }),
  ]);
  return jsonResponse({ blocked: true });
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireSocial(request, 'block-delete', 30);
  if ('response' in gate) return gate.response;
  const { userId } = await route.params;
  if (!mongoose.isValidObjectId(userId)) return jsonResponse({ error: 'Profile not found.' }, 404);
  await SocialBlock.deleteOne({ blockerId: gate.userId, blockedId: userId });
  return jsonResponse({ blocked: false });
}
