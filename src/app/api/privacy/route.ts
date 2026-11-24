import { NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/server/auth-session';
import { connectToDatabase } from '@/lib/server/db';
import { Session } from '@/models/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await getAuthenticatedContext();

    if (!ctx) {
      return NextResponse.json({
        authenticated: false,
        mode: 'local_preview',
        user: null,
        sessions: [],
        serverStorageNotice: 'Local preview mode: No server-side account or database session exists for this browser.',
      }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }

    await connectToDatabase();
    const rawSessions = await Session.find({
      userId: ctx.user.id,
      expiresAt: { $gt: new Date() },
    })
      .select('_id createdAt lastUsedAt expiresAt')
      .sort({ lastUsedAt: -1 })
      .lean();

    const sessions = rawSessions.map((s) => ({
      id: s._id.toString(),
      isCurrentDevice: s._id.toString() === ctx.sessionId,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
    }));

    return NextResponse.json({
      authenticated: true,
      mode: 'authenticated',
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        fullName: ctx.user.fullName,
        status: ctx.user.status,
      },
      sessions,
      serverStorageNotice: 'Authentication session active. Password stored securely on server as salted scrypt hash.',
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to retrieve privacy overview metadata' },
      { status: 500 }
    );
  }
}
