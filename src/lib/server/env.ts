import 'server-only';
import { z } from 'zod';

const databaseEnvironmentSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required.'),
});

const securityEnvironmentSchema = z.object({
  AUTH_RATE_LIMIT_SECRET: z.string().min(32, 'AUTH_RATE_LIMIT_SECRET must contain at least 32 characters.'),
});

export function getMongoUri() {
  const parsed = databaseEnvironmentSchema.safeParse(process.env);
  if (!parsed.success) throw new Error('MongoDB is not configured. Set MONGODB_URI.');

  let uri: URL;
  try {
    uri = new URL(parsed.data.MONGODB_URI);
  } catch {
    throw new Error('MONGODB_URI must be a valid MongoDB connection string.');
  }

  if (uri.protocol !== 'mongodb:' && uri.protocol !== 'mongodb+srv:') {
    throw new Error('MONGODB_URI must use the mongodb or mongodb+srv protocol.');
  }
  if (process.env.NODE_ENV === 'production' && uri.protocol === 'mongodb:'
    && !['localhost', '127.0.0.1', '::1'].includes(uri.hostname)
    && uri.searchParams.get('tls') !== 'true') {
    throw new Error('Remote production MongoDB connections must enable TLS.');
  }

  return parsed.data.MONGODB_URI;
}

export function getRateLimitSecret() {
  const parsed = securityEnvironmentSchema.safeParse(process.env);
  if (!parsed.success) throw new Error('Authentication rate limiting is not configured. Set AUTH_RATE_LIMIT_SECRET.');
  return parsed.data.AUTH_RATE_LIMIT_SECRET;
}

export function getAppOrigin(fallback?: string) {
  if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN) {
    throw new Error('APP_ORIGIN is required in production.');
  }
  const value = process.env.APP_ORIGIN ?? fallback;
  if (!value) throw new Error('APP_ORIGIN is required for password recovery links.');

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error();
    return url.origin;
  } catch {
    throw new Error('APP_ORIGIN must be a valid HTTP or HTTPS origin.');
  }
}

export function getRecoveryEmailConfig(fallbackOrigin?: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error('Password recovery email is not configured. Set RESEND_API_KEY and EMAIL_FROM.');
  }
  return { apiKey, from, appOrigin: getAppOrigin(fallbackOrigin) };
}
