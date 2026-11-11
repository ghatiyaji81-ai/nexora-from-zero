import 'server-only';
import { cookies } from 'next/headers';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/server/db';
import { createOpaqueToken, hashOpaqueToken } from '@/lib/server/password';
import { Permission } from '@/models/permission';
import { Profile } from '@/models/profile';
import { Session } from '@/models/session';
import { User } from '@/models/user';

export const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Host-nexora_session'
  : 'nexora_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AuthenticatedContext = {
  user: { id: string; email: string; fullName: string; status: 'active' | 'disabled' };
  profile: { displayName: string; bio: string; avatarUrl?: string; locale: 'en' | 'hi' } | null;
  permission: { role: 'owner' | 'member' | 'admin'; grants: string[] } | null;
  sessionId: string;
};

export async function createSession(userId: mongoose.Types.ObjectId, transaction?: mongoose.ClientSession) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const values = { userId, tokenHash: hashOpaqueToken(token), expiresAt, lastUsedAt: new Date() };
  if (transaction) await Session.create([values], { session: transaction });
  else await Session.create(values);
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  await connectToDatabase();
  const session = await Session.findOne({
    tokenHash: hashOpaqueToken(token),
    expiresAt: { $gt: new Date() },
  }).select('_id userId expiresAt').lean();
  if (!session) return null;

  const [user, profile, permission] = await Promise.all([
    User.findOne({ _id: session.userId, status: 'active' }).select('_id email fullName status').lean(),
    Profile.findOne({ userId: session.userId }).select('displayName bio avatarUrl locale').lean(),
    Permission.findOne({ userId: session.userId }).select('role grants').lean(),
  ]);

  if (!user) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }

  return {
    user: { id: user._id.toString(), email: user.email, fullName: user.fullName, status: user.status },
    profile: profile ? {
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      locale: profile.locale,
    } : null,
    permission: permission ? { role: permission.role, grants: permission.grants } : null,
    sessionId: session._id.toString(),
  };
}
