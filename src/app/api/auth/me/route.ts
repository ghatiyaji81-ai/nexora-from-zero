import { getAuthenticatedContext } from '@/lib/server/auth-session';
import { jsonResponse } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if (!context) return jsonResponse({ error: 'Not signed in.' }, 401);
    return jsonResponse({ user: context.user, profile: context.profile, permission: context.permission });
  } catch (error) {
    console.error('[auth/me] request failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'Account details are temporarily unavailable.' }, 503);
  }
}
