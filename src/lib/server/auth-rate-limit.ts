import 'server-only';
import { createHmac } from 'node:crypto';
import { AuthRateLimit } from '@/models/auth-rate-limit';
import { getRateLimitSecret } from '@/lib/server/env';

const WINDOW_MS = 15 * 60 * 1000;

function getClientAddress(request: Request) {
  const trustedProxyAddress = request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return trustedProxyAddress || 'unknown';
}

async function incrementBucket(scope: string) {
  const now = Date.now();
  const bucketStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const bucketHash = createHmac('sha256', getRateLimitSecret())
    .update(`${scope}|${bucketStart}`)
    .digest('hex');
  const expiresAt = new Date(bucketStart + WINDOW_MS + 60_000);

  try {
    const record = await AuthRateLimit.findOneAndUpdate(
      { bucketHash },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).select('count').lean();
    return record?.count ?? 1;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const record = await AuthRateLimit.findOneAndUpdate(
      { bucketHash },
      { $inc: { count: 1 } },
      { new: true },
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
  const counts = await Promise.all(scopes.map(({ key }) => incrementBucket(key)));
  const exceeded = scopes.some((scope, index) => counts[index] > scope.limit);
  return { allowed: !exceeded, retryAfterSeconds: Math.ceil((WINDOW_MS - (Date.now() % WINDOW_MS)) / 1000) };
}
