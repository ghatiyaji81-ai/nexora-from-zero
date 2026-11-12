import mongoose from 'mongoose';
import { z } from 'zod';
import { hasSocialBlockBetween, notifySocial, requireSocial } from '@/lib/server/social';
import { jsonResponse } from '@/lib/server/http';
import { SocialFollow } from '@/models/social-follow';
import { SocialFollowRequest } from '@/models/social-follow-request';
import { SocialProfile } from '@/models/social-profile';
import { User } from '@/models/user';

export const runtime = 'nodejs';
type Context = { params: Promise<{ userId: string }> };
const requestSchema = z.object({ action: z.enum(['follow', 'unfollow']) }).strict();

export async function POST(request: Request, route: Context) {
  const gate = await requireSocial(request, 'follow-change', 40);
  if ('response' in gate) return gate.response;
  const { userId } = await route.params;
  const parsed = requestSchema.safeParse(await readBody(request));
  if (!mongoose.isValidObjectId(userId) || !parsed.success || gate.userId.toString() === userId) return jsonResponse({ error: 'The follow request is invalid.' }, 400);
  const targetId = new mongoose.Types.ObjectId(userId);
  const profile = await SocialProfile.findOne({ userId: targetId }).select('visibility').lean();
  if (!profile || !await User.exists({ _id: targetId, status: 'active' }) || await hasSocialBlockBetween(gate.userId, targetId)) {
    return jsonResponse({ error: 'Profile not found.' }, 404);
  }
  if (parsed.data.action === 'unfollow') {
    await Promise.all([
      SocialFollow.deleteOne({ followerId: gate.userId, followingId: targetId }),
      SocialFollowRequest.deleteOne({ requesterId: gate.userId, recipientId: targetId, status: 'pending' }),
    ]);
    return jsonResponse({ status: 'unfollowed' });
  }
  if (await SocialFollow.exists({ followerId: gate.userId, followingId: targetId })) {
    return jsonResponse({ status: 'following' });
  }
  if (profile.visibility === 'private') {
    await SocialFollowRequest.updateOne(
      { requesterId: gate.userId, recipientId: targetId },
      { $set: { status: 'pending' }, $setOnInsert: { requesterId: gate.userId, recipientId: targetId } },
      { upsert: true, runValidators: true },
    );
    await notifySocial({ ownerId: targetId, actorId: gate.userId, type: 'follow_request' });
    return jsonResponse({ status: 'requested' }, 201);
  }
  await SocialFollow.updateOne(
    { followerId: gate.userId, followingId: targetId },
    { $setOnInsert: { followerId: gate.userId, followingId: targetId } },
    { upsert: true },
  );
  await SocialFollowRequest.deleteOne({ requesterId: gate.userId, recipientId: targetId });
  await notifySocial({ ownerId: targetId, actorId: gate.userId, type: 'follow' });
  return jsonResponse({ status: 'following' }, 201);
}

export async function DELETE(request: Request, route: Context) {
  const gate = await requireSocial(request, 'follow-change', 40);
  if ('response' in gate) return gate.response;
  const { userId } = await route.params;
  if (!mongoose.isValidObjectId(userId) || gate.userId.toString() === userId) return jsonResponse({ error: 'Profile not found.' }, 404);
  const targetId = new mongoose.Types.ObjectId(userId);
  await Promise.all([
    SocialFollow.deleteOne({ followerId: gate.userId, followingId: targetId }),
    SocialFollowRequest.deleteOne({ requesterId: gate.userId, recipientId: targetId }),
  ]);
  return jsonResponse({ status: 'unfollowed' });
}

async function readBody(request: Request) {
  const { parseJsonBody } = await import('@/lib/server/http');
  return parseJsonBody(request, 2 * 1024);
}
