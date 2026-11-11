import mongoose from 'mongoose';
import { consumeAuthBudget } from '@/lib/server/auth-rate-limit';
import { connectToDatabase } from '@/lib/server/db';
import { jsonResponse, parseJsonBody, requestIsSameOrigin } from '@/lib/server/http';
import { hashOpaqueToken, hashPassword } from '@/lib/server/password';
import { passwordResetSchema, validationMessage } from '@/lib/server/validation';
import { PasswordResetToken } from '@/models/password-reset-token';
import { Session } from '@/models/session';
import { User } from '@/models/user';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) return jsonResponse({ error: 'Request origin could not be verified.' }, 403);

  const body = await parseJsonBody(request);
  const parsed = passwordResetSchema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: validationMessage(parsed.error) }, 400);

  const { token, password } = parsed.data;
  try {
    await connectToDatabase();
    const budget = await consumeAuthBudget(request, 'reset-password');
    if (!budget.allowed) {
      return jsonResponse({ error: 'Too many attempts. Try again later.' }, 429, { 'Retry-After': String(budget.retryAfterSeconds) });
    }

    const tokenHash = hashOpaqueToken(token);
    const candidate = await PasswordResetToken.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
      usedAt: { $exists: false },
    }).select('userId');
    if (!candidate) return jsonResponse({ error: 'This recovery link is invalid or expired.' }, 400);

    const passwordHash = await hashPassword(password);
    const transaction = await mongoose.connection.startSession();
    let consumed = false;
    try {
      await transaction.withTransaction(async () => {
        const reset = await PasswordResetToken.findOneAndUpdate(
          { _id: candidate._id, tokenHash, expiresAt: { $gt: new Date() }, usedAt: { $exists: false } },
          { $set: { usedAt: new Date() } },
          { new: true, session: transaction },
        ).select('userId');
        if (!reset) return;

        const update = await User.updateOne({ _id: reset.userId, status: 'active' }, { $set: { passwordHash } }, { session: transaction });
        if (update.modifiedCount !== 1) throw new Error('Account could not be updated.');
        await Session.deleteMany({ userId: reset.userId }, { session: transaction });
        await PasswordResetToken.deleteMany({ userId: reset.userId }, { session: transaction });
        consumed = true;
      });
    } finally {
      await transaction.endSession();
    }

    if (!consumed) return jsonResponse({ error: 'This recovery link is invalid or expired.' }, 400);
    return jsonResponse({ message: 'Password updated. Sign in with your new password.' });
  } catch (error) {
    console.error('[auth/reset-password] request failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'Password reset is temporarily unavailable.' }, 503);
  }
}
