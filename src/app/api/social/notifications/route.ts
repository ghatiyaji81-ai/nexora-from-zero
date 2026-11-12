import { requireSocial } from '@/lib/server/social';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { SocialNotification } from '@/models/social-notification';
import { SocialProfile } from '@/models/social-profile';
import { User } from '@/models/user';
import { z } from 'zod';

export const runtime = 'nodejs';
const readSchema = z.object({ ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).optional() }).strict();

export async function GET(request: Request) {
  const gate = await requireSocial(request, 'notification-list');
  if ('response' in gate) return gate.response;
  const [notifications, unreadCount] = await Promise.all([
    SocialNotification.find({ ownerId: gate.userId }).sort({ createdAt: -1 }).limit(100).lean(),
    SocialNotification.countDocuments({ ownerId: gate.userId, readAt: { $exists: false } }),
  ]);
  const actorIds = [...new Map(notifications.map(item => [item.actorId.toString(), item.actorId])).values()];
  const [profiles, users] = await Promise.all([
    SocialProfile.find({ userId: { $in: actorIds } }).select('userId username displayName').lean(),
    User.find({ _id: { $in: actorIds }, status: 'active' }).select('_id').lean(),
  ]);
  const profileMap = new Map(profiles.map(item => [item.userId.toString(), item]));
  const active = new Set(users.map(item => item._id.toString()));
  return jsonResponse({
    unreadCount,
    notifications: notifications.flatMap(item => {
      const actor = profileMap.get(item.actorId.toString());
      if (!actor || !active.has(item.actorId.toString())) return [];
      return [{ id: item._id.toString(), type: item.type, targetId: item.targetId?.toString() ?? null, readAt: item.readAt ?? null, createdAt: item.createdAt,
        actor: { id: item.actorId.toString(), username: actor.username, displayName: actor.displayName } }];
    }),
  });
}

export async function PATCH(request: Request) {
  const gate = await requireSocial(request, 'notification-read', 30);
  if ('response' in gate) return gate.response;
  const parsed = readSchema.safeParse(await parseJsonBody(request, 4 * 1024));
  if (!parsed.success) return jsonResponse({ error: 'The notification update is invalid.' }, 400);
  await SocialNotification.updateMany({
    ownerId: gate.userId, readAt: { $exists: false },
    ...(parsed.data.ids ? { _id: { $in: parsed.data.ids } } : {}),
  }, { $set: { readAt: new Date() } });
  return jsonResponse({ success: true });
}
