import { cookies } from 'next/headers';
import { clearSessionCookie, SESSION_COOKIE_NAME } from '@/lib/server/auth-session';
import { connectToDatabase } from '@/lib/server/db';
import { jsonResponse, requestIsSameOrigin } from '@/lib/server/http';
import { hashOpaqueToken } from '@/lib/server/password';
import { Session } from '@/models/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) return jsonResponse({ error: 'Request origin could not be verified.' }, 403);

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    await clearSessionCookie();
    return jsonResponse({ success: true });
  }

  try {
    await connectToDatabase();
    await Session.deleteOne({ tokenHash: hashOpaqueToken(token) });
    await clearSessionCookie();
    return jsonResponse({ success: true });
  } catch (error) {
    console.error('[auth/logout] session invalidation failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    await clearSessionCookie();
    return jsonResponse({ error: 'The browser session was cleared, but server-side sign out could not be confirmed.' }, 503);
  }
}
