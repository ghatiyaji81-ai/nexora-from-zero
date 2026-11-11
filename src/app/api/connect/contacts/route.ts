import mongoose from 'mongoose';
import { z } from 'zod';
import { requireConnect } from '@/lib/server/connect';
import { jsonResponse } from '@/lib/server/http';
import { Presence } from '@/models/presence';
import { Profile } from '@/models/profile';
import { User } from '@/models/user';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireConnect(request, 'contacts-search', 90);
  if ('response' in gate) return gate.response;
  const url = new URL(request.url);
  const query = z.string().trim().max(100).catch('').parse(url.searchParams.get('q') ?? '');
  const filter: Record<string, unknown> = { status: 'active', _id: { $ne: new mongoose.Types.ObjectId(gate.context.user.id) } };
  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ fullName: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }];
  }
  const users = await User.find(filter).select('_id fullName email').sort({ fullName: 1 }).limit(30).lean();
  const ids = users.map(user => user._id);
  const [profiles, presence] = await Promise.all([
    Profile.find({ userId: { $in: ids } }).select('userId displayName avatarUrl').lean(),
    Presence.find({ userId: { $in: ids }, expiresAt: { $gt: new Date() } }).select('userId lastSeenAt').lean(),
  ]);
  const profileById = new Map(profiles.map(profile => [profile.userId.toString(), profile]));
  const presenceById = new Map(presence.map(item => [item.userId.toString(), item]));
  return jsonResponse({ contacts: users.map(user => {
    const id = user._id.toString();
    const profile = profileById.get(id);
    const online = presenceById.get(id);
    return { id, name: profile?.displayName ?? user.fullName, email: user.email, avatarUrl: profile?.avatarUrl, online: Boolean(online), lastSeenAt: online?.lastSeenAt };
  }) });
}
