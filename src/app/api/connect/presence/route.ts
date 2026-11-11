import mongoose from 'mongoose';
import { requireConnect } from '@/lib/server/connect';
import { jsonResponse } from '@/lib/server/http';
import { Presence } from '@/models/presence';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireConnect(request, 'presence-heartbeat', 40);
  if ('response' in gate) return gate.response;
  const userId = new mongoose.Types.ObjectId(gate.context.user.id);
  const lastSeenAt = new Date();
  await Presence.findOneAndUpdate({ userId }, { $set: { lastSeenAt, expiresAt: new Date(Date.now() + 75_000) } }, { upsert: true, setDefaultsOnInsert: true });
  return jsonResponse({ online: true, lastSeenAt });
}
