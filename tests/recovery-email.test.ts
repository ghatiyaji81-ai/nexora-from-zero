import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendPasswordRecoveryEmail } from '../src/lib/server/recovery-email';

test('password recovery sends a configured reset link through the Resend API adapter', async () => {
  const previousValues = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    origin: process.env.APP_ORIGIN,
  };
  const originalFetch = globalThis.fetch;
  let calledUrl = '';
  let calledInit: RequestInit | undefined;

  process.env.RESEND_API_KEY = 're_test_key';
  process.env.EMAIL_FROM = 'NEXORA <noreply@example.test>';
  process.env.APP_ORIGIN = 'https://nexora.example.test';
  globalThis.fetch = async (input, init) => {
    calledUrl = String(input);
    calledInit = init;
    return new Response(null, { status: 200 });
  };

  try {
    await sendPasswordRecoveryEmail('person@example.test', 'opaque_recovery_token', 'http://localhost:3000');

    assert.equal(calledUrl, 'https://api.resend.com/emails');
    assert.equal(new Headers(calledInit?.headers).get('authorization'), 'Bearer re_test_key');
    const payload = JSON.parse(String(calledInit?.body)) as { to: string[]; text: string };
    assert.deepEqual(payload.to, ['person@example.test']);
    assert.match(payload.text, /30 minutes/);
    assert.match(payload.text, /https:\/\/nexora\.example\.test\/reset-password\?token=opaque_recovery_token/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousValues.apiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousValues.apiKey;
    if (previousValues.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousValues.from;
    if (previousValues.origin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousValues.origin;
  }
});
