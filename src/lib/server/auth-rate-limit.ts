import 'server-only';
import { createHmac } from 'node:crypto';
import { AuthRateLimit } from '@/models/auth-rate-limit';
import { getRateLimitSecret } from '@/lib/server/env';

const AUTH_WINDOW_MS = 15 * 60 * 1000;

function getClientAddress(request: Request) {
  const trustedProxyAddress = request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return trustedProxyAddress || 'unknown';
}

async function incrementBucket(scope: string, windowMs: number) {
  const now = Date.now();
  const bucketStart = Math.floor(now / windowMs) * windowMs;
  const bucketHash = createHmac('sha256', getRateLimitSecret())
    .update(`${scope}|${bucketStart}`)
    .digest('hex');
  const expiresAt = new Date(bucketStart + windowMs + 60_000);

  try {
    const record = await AuthRateLimit.findOneAndUpdate(
      { bucketHash },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    ).select('count').lean();
    return record?.count ?? 1;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const record = await AuthRateLimit.findOneAndUpdate(
      { bucketHash },
      { $inc: { count: 1 } },
      { returnDocument: 'after' },
    ).select('count').lean();
    return record?.count ?? 1;
  }
}

export async function consumeAuthBudget(request: Request, action: string, email?: string) {
  const address = getClientAddress(request);
  const scopes = [
    { key: `ip:${address}`, limit: 30 },
    ...(email ? [{ key: `${action}:${address}:${email}`, limit: 8 }] : []),
  ];
  const counts = await Promise.all(scopes.map(({ key }) => incrementBucket(key, AUTH_WINDOW_MS)));
  const exceeded = scopes.some((scope, index) => counts[index] > scope.limit);
  return { allowed: !exceeded, retryAfterSeconds: Math.ceil((AUTH_WINDOW_MS - (Date.now() % AUTH_WINDOW_MS)) / 1000) };
}

export async function consumeRateLimit(request: Request, scope: string, limit: number, windowMs = 60_000, subject?: string) {
  const address = getClientAddress(request);
  const keys = [`${scope}:ip:${address}`, ...(subject ? [`${scope}:subject:${subject}`] : [])];
  const counts = await Promise.all(keys.map(key => incrementBucket(key, windowMs)));
  return {
    allowed: counts.every(count => count <= limit),
    retryAfterSeconds: Math.ceil((windowMs - (Date.now() % windowMs)) / 1000),
  };
}
