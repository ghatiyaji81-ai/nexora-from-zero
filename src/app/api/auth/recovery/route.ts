import { createOpaqueToken, hashOpaqueToken } from '@/lib/server/password';
import { sendPasswordRecoveryEmail } from '@/lib/server/recovery-email';
import { consumeAuthBudget } from '@/lib/server/auth-rate-limit';
import { connectToDatabase } from '@/lib/server/db';
import { getRecoveryEmailConfig } from '@/lib/server/env';
import { jsonResponse, parseJsonBody, requestIsSameOrigin } from '@/lib/server/http';
import { recoveryRequestSchema, validationMessage } from '@/lib/server/validation';
import { PasswordResetToken } from '@/models/password-reset-token';
import { User } from '@/models/user';

export const runtime = 'nodejs';

const RESET_TTL_MS = 30 * 60 * 1000;

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) return jsonResponse({ error: 'Request origin could not be verified.' }, 403);

  const body = await parseJsonBody(request);
  const parsed = recoveryRequestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: validationMessage(parsed.error) }, 400);

  const { email } = parsed.data;
  try {
    // Validate email delivery configuration before looking up an account so a missing
    // provider cannot disclose whether an email address has a NEXORA account.
    getRecoveryEmailConfig(new URL(request.url).origin);
    await connectToDatabase();
    const budget = await consumeAuthBudget(request, 'recovery', email);
    if (!budget.allowed) {
      return jsonResponse({ error: 'Too many attempts. Try again later.' }, 429, { 'Retry-After': String(budget.retryAfterSeconds) });
    }

    const user = await User.findOne({ email, status: 'active' }).select('_id');
    const token = createOpaqueToken();
    if (user) {
      await PasswordResetToken.deleteMany({ userId: user._id, usedAt: { $exists: false } });
      await PasswordResetToken.create({
        userId: user._id,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      });
    }

    // Send the same message for known and unknown addresses; unknown addresses receive
    // an unbacked token that cannot reset an account.
    await sendPasswordRecoveryEmail(email, token, new URL(request.url).origin);
    return jsonResponse({ message: 'If an account exists, a recovery email will arrive shortly.' }, 202);
  } catch (error) {
    console.error('[auth/recovery] request failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    if (error instanceof Error && error.message.includes('not configured')) {
      return jsonResponse({ error: 'Password recovery email is not configured on this deployment.' }, 503);
    }
    return jsonResponse({ error: 'Password recovery is temporarily unavailable.' }, 503);
  }
}
