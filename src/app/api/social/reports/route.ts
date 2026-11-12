import mongoose from 'mongoose';
import { z } from 'zod';
import { requireSocial } from '@/lib/server/social';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { SocialComment } from '@/models/social-comment';
import { SocialPost } from '@/models/social-post';
import { SocialReport } from '@/models/social-report';
import { SocialStory } from '@/models/social-story';
import { User } from '@/models/user';

export const runtime = 'nodejs';
const reportSchema = z.object({
  targetType: z.enum(['profile', 'post', 'comment', 'story']),
  targetId: z.string().regex(/^[a-f\d]{24}$/i),
  reason: z.enum(['spam', 'harassment', 'hate', 'violence', 'privacy', 'other']),
  details: z.string().trim().max(1000).default(''),
}).strict();

export async function POST(request: Request) {
  const gate = await requireSocial(request, 'report-create', 10);
  if ('response' in gate) return gate.response;
  const parsed = reportSchema.safeParse(await parseJsonBody(request, 3 * 1024));
  if (!parsed.success) return jsonResponse({ error: 'The report details are invalid.' }, 400);
  if (!mongoose.isValidObjectId(parsed.data.targetId)) return jsonResponse({ error: 'The report details are invalid.' }, 400);
  const targetId = new mongoose.Types.ObjectId(parsed.data.targetId);
  if (targetId.equals(gate.userId)) return jsonResponse({ error: 'You cannot report your own profile.' }, 400);
  let exists = false;
  if (parsed.data.targetType === 'profile') exists = Boolean(await User.exists({ _id: targetId, status: 'active' }));
  if (parsed.data.targetType === 'post') exists = Boolean(await SocialPost.exists({ _id: targetId }));
  if (parsed.data.targetType === 'comment') exists = Boolean(await SocialComment.exists({ _id: targetId }));
  if (parsed.data.targetType === 'story') exists = Boolean(await SocialStory.exists({ _id: targetId, expiresAt: { $gt: new Date() } }));
  if (!exists) return jsonResponse({ error: 'The reported item is no longer available.' }, 404);
  try {
    await SocialReport.create({ reporterId: gate.userId, targetType: parsed.data.targetType, targetId, reason: parsed.data.reason, details: parsed.data.details });
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error;
    return jsonResponse({ error: 'You have already reported this item.' }, 409);
  }
  return jsonResponse({ submitted: true }, 201);
}
