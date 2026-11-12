import { z } from 'zod';
import { ensureSocialProfile, requireSocial } from '@/lib/server/social';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';

export const runtime = 'nodejs';
const websiteSchema = z.string().trim().max(300).url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)).optional().or(z.literal(''));
const updateSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(30).regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/),
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500).optional(),
  website: websiteSchema,
  location: z.string().trim().max(100).optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  visibility: z.enum(['public', 'private']),
}).strict();

export async function GET(request: Request) {
  const gate = await requireSocial(request, 'my-profile');
  if ('response' in gate) return gate.response;
  const profile = await ensureSocialProfile(gate.userId, gate.context.profile?.displayName ?? gate.context.user.fullName);
  const [followersCount, followingCount, postCount] = await counts(gate.userId);
  return jsonResponse({ profile: publicProfile(profile, { followersCount, followingCount, postCount }) });
}

export async function PATCH(request: Request) {
  const gate = await requireSocial(request, 'profile-update', 30);
  if ('response' in gate) return gate.response;
  const parsed = updateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return jsonResponse({ error: 'Profile details are invalid.' }, 400);
  const profile = await ensureSocialProfile(gate.userId, gate.context.profile?.displayName ?? gate.context.user.fullName);
  Object.assign(profile, {
    ...parsed.data,
    bio: parsed.data.bio ?? '',
    website: parsed.data.website || undefined,
    location: parsed.data.location || undefined,
    interests: [...new Set(parsed.data.interests ?? [])],
  });
  try {
    await profile.save();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000) return jsonResponse({ error: 'That username is already in use.' }, 409);
    throw error;
  }
  const [followersCount, followingCount, postCount] = await counts(gate.userId);
  return jsonResponse({ profile: publicProfile(profile, { followersCount, followingCount, postCount }) });
}

async function counts(userId: import('mongoose').Types.ObjectId) {
  const [{ SocialFollow }, { SocialPost }] = await Promise.all([
    import('@/models/social-follow'),
    import('@/models/social-post'),
  ]);
  return Promise.all([
    SocialFollow.countDocuments({ followingId: userId }),
    SocialFollow.countDocuments({ followerId: userId }),
    SocialPost.countDocuments({ ownerId: userId }),
  ]);
}

function publicProfile(profile: {
  _id: import('mongoose').Types.ObjectId;
  userId: import('mongoose').Types.ObjectId;
  username: string;
  displayName: string;
  bio: string;
  website?: string;
  location?: string;
  interests: string[];
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
}, totals: { followersCount: number; followingCount: number; postCount: number }) {
  return {
    id: profile.userId.toString(), username: profile.username, displayName: profile.displayName,
    bio: profile.bio, website: profile.website ?? null, location: profile.location ?? null,
    interests: profile.interests, visibility: profile.visibility, ...totals,
    createdAt: profile.createdAt, updatedAt: profile.updatedAt,
  };
}
