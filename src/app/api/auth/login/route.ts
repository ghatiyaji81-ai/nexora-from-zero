import { createSession, setSessionCookie } from '@/lib/server/auth-session';
import { consumeAuthBudget } from '@/lib/server/auth-rate-limit';
import { connectToDatabase } from '@/lib/server/db';
import { jsonResponse, parseJsonBody, requestIsSameOrigin } from '@/lib/server/http';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { loginSchema, validationMessage } from '@/lib/server/validation';
import { User } from '@/models/user';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) return jsonResponse({ error: 'Request origin could not be verified.' }, 403);

  const body = await parseJsonBody(request);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: validationMessage(parsed.error) }, 400);

  const { email, password } = parsed.data;
  try {
    await connectToDatabase();
    const budget = await consumeAuthBudget(request, 'login', email);
    if (!budget.allowed) {
      return jsonResponse({ error: 'Too many attempts. Try again later.' }, 429, { 'Retry-After': String(budget.retryAfterSeconds) });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      await hashPassword(password);
      return jsonResponse({ error: 'Email or password is incorrect.' }, 401);
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches || user.status !== 'active') {
      return jsonResponse({ error: 'Email or password is incorrect.' }, 401);
    }

    const session = await createSession(user._id);
    await setSessionCookie(session.token, session.expiresAt);
    return jsonResponse({ user: { id: user.id, email: user.email, fullName: user.fullName } });
  } catch (error) {
    console.error('[auth/login] request failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'Sign in is temporarily unavailable.' }, 503);
  }
}
