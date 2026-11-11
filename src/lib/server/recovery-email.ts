import 'server-only';
import { getRecoveryEmailConfig } from '@/lib/server/env';

export async function sendPasswordRecoveryEmail(email: string, token: string, requestOrigin: string) {
  const config = getRecoveryEmailConfig(requestOrigin);
  const recoveryUrl = new URL('/reset-password', config.appOrigin);
  recoveryUrl.searchParams.set('token', token);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [email],
      subject: 'Reset your NEXORA password',
      text: `A password reset was requested for your NEXORA account. The link expires in 30 minutes. If you did not request this, ignore this email.\n\n${recoveryUrl.toString()}`,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Recovery email delivery failed with status ${response.status}.`);
}
