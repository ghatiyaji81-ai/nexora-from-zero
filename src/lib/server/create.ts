import 'server-only';
import mongoose from 'mongoose';
import { getAuthenticatedContext } from '@/lib/server/auth-session';
import { consumeRateLimit } from '@/lib/server/auth-rate-limit';
import { connectToDatabase } from '@/lib/server/db';
import { jsonResponse, requestIsSameOrigin } from '@/lib/server/http';

export async function requireCreate(request: Request, scope: string, limit = 90) {
  const context = await getAuthenticatedContext();
  if (!context) return { response: jsonResponse({ error: 'Sign in to use CREATE.' }, 401) };
  if (request.method !== 'GET' && !requestIsSameOrigin(request)) {
    return { response: jsonResponse({ error: 'Request origin could not be verified.' }, 403) };
  }
  await connectToDatabase();
  const budget = await consumeRateLimit(request, `create:${scope}`, limit, 60_000, context.user.id);
  if (!budget.allowed) {
    return { response: jsonResponse({ error: 'You are doing that too often. Try again shortly.' }, 429, { 'Retry-After': String(budget.retryAfterSeconds) }) };
  }
  return { context, ownerId: new mongoose.Types.ObjectId(context.user.id) };
}
