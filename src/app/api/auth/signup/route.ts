import mongoose from 'mongoose';
import { createSession, setSessionCookie } from '@/lib/server/auth-session';
import { consumeAuthBudget } from '@/lib/server/auth-rate-limit';
import { connectToDatabase } from '@/lib/server/db';
import { jsonResponse, parseJsonBody, requestIsSameOrigin } from '@/lib/server/http';
import { hashPassword } from '@/lib/server/password';
import { signupSchema, validationMessage } from '@/lib/server/validation';
import { Permission } from '@/models/permission';
import { Profile } from '@/models/profile';
import { User } from '@/models/user';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) return jsonResponse({ error: 'Request origin could not be verified.' }, 403);

  const body = await parseJsonBody(request);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: validationMessage(parsed.error) }, 400);

  const { fullName, email, password } = parsed.data;
  let transaction: mongoose.ClientSession | undefined;
  try {
    await connectToDatabase();
    const budget = await consumeAuthBudget(request, 'signup', email);
    if (!budget.allowed) {
      return jsonResponse({ error: 'Too many attempts. Try again later.' }, 429, { 'Retry-After': String(budget.retryAfterSeconds) });
    }

    if (await User.exists({ email })) return jsonResponse({ error: 'An account with this email already exists.' }, 409);

    const passwordHash = await hashPassword(password);
    transaction = await mongoose.connection.startSession();
    let result: { id: string; email: string; fullName: string; token: string; expiresAt: Date } | undefined;

    await transaction.withTransaction(async () => {
      const [user] = await User.create([{ email, fullName, passwordHash }], { session: transaction });
      await Profile.create([{ userId: user._id, displayName: fullName, locale: 'en' }], { session: transaction });
      await Permission.create([{ userId: user._id, role: 'owner' }], { session: transaction });
      const session = await createSession(user._id, transaction);
      result = { id: user._id.toString(), email: user.email, fullName: user.fullName, ...session };
    });

    if (!result) throw new Error('Account transaction did not produce a result.');
    await setSessionCookie(result.token, result.expiresAt);
    return jsonResponse({ user: { id: result.id, email: result.email, fullName: result.fullName } }, 201);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return jsonResponse({ error: 'An account with this email already exists.' }, 409);
    }
    console.error('[auth/signup] request failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'Account setup is temporarily unavailable.' }, 503);
  } finally {
    await transaction?.endSession();
  }
}
