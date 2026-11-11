import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/server/db';
import { createOpaqueToken, hashOpaqueToken } from '../src/lib/server/password';
import { PasswordResetToken } from '../src/models/password-reset-token';
import { Permission } from '../src/models/permission';
import { Profile } from '../src/models/profile';
import { Session } from '../src/models/session';
import { User } from '../src/models/user';

const baseUrl = process.env.NEXORA_TEST_ORIGIN ?? 'http://127.0.0.1:3001';
const origin = process.env.NEXORA_TEST_ORIGIN_HEADER ?? new URL(baseUrl).origin;
const testAddress = `integration-${randomUUID()}`;

async function post(path: string, data: unknown, cookie?: string, requestOrigin = origin) {
  return fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: requestOrigin,
      'x-real-ip': testAddress,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(data),
    redirect: 'manual',
  });
}

function getCookie(response: Response) {
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'auth response should set a session cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//i);
  if (process.env.NEXORA_TEST_SECURE_COOKIE === '1') assert.match(setCookie, /Secure/i);
  return setCookie.split(';', 1)[0];
}

test('signup, login, protected workspace, single-use reset, and logout work against MongoDB', async () => {
  await connectToDatabase();
  const email = `nexora-${randomUUID()}@example.test`;
  const password = 'Correct horse battery staple 82!';
  const nextPassword = 'An updated secure passphrase 91!';
  let userId: mongoose.Types.ObjectId | undefined;
  let cookieFromSignup: string | undefined;
  let cookieFromLogin: string | undefined;

  try {
    for (const [path, marker] of [
      ['/', 'YOUR SPACE'],
      ['/login', 'Welcome back.'],
      ['/signup', 'Make it yours.'],
      ['/forgot-password', 'Find your way back.'],
      ['/reset-password', 'Choose a new password.'],
    ]) {
      const page = await fetch(new URL(path, baseUrl));
      assert.equal(page.status, 200, `${path} should render`);
      assert.match(await page.text(), new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    const deniedOrigin = await post('/api/auth/signup', {
      fullName: 'Workflow Test', email, password, confirmPassword: password,
    }, undefined, 'https://untrusted.example');
    assert.equal(deniedOrigin.status, 403);

    const invalid = await post('/api/auth/signup', {
      fullName: 'Workflow Test', email, password, confirmPassword: 'different password',
    });
    assert.equal(invalid.status, 400);

    const signup = await post('/api/auth/signup', {
      fullName: 'Workflow Test', email, password, confirmPassword: password,
    });
    assert.equal(signup.status, 201);
    const created = await signup.json() as { user: { id: string; email: string; fullName: string } };
    assert.equal(created.user.email, email);
    userId = new mongoose.Types.ObjectId(created.user.id);
    cookieFromSignup = getCookie(signup);

    const user = await User.findById(userId).select('+passwordHash');
    assert.ok(user);
    assert.equal(user.passwordHash.includes(password), false);
    assert.ok(await Profile.exists({ userId }));
    assert.ok(await Permission.exists({ userId }));
    assert.equal(await Session.countDocuments({ userId }), 1);

    const duplicate = await post('/api/auth/signup', {
      fullName: 'Workflow Test', email, password, confirmPassword: password,
    });
    assert.equal(duplicate.status, 409);

    const wrongLogin = await post('/api/auth/login', { email, password: 'Wrong passphrase 91!' });
    assert.equal(wrongLogin.status, 401);

    const login = await post('/api/auth/login', { email, password });
    assert.equal(login.status, 200);
    cookieFromLogin = getCookie(login);

    const me = await fetch(new URL('/api/auth/me', baseUrl), { headers: { Cookie: cookieFromLogin } });
    assert.equal(me.status, 200);
    const account = await me.json() as { profile: { displayName: string }; permission: { grants: string[] } };
    assert.equal(account.profile.displayName, 'Workflow Test');
    assert.ok(account.permission.grants.includes('workspace:read'));

    const workspace = await fetch(new URL('/workspace', baseUrl), { headers: { Cookie: cookieFromLogin }, redirect: 'manual' });
    assert.equal(workspace.status, 200);
    assert.match(await workspace.text(), /PRIVATE WORKSPACE/);

    const unauthorized = await fetch(new URL('/workspace', baseUrl), { redirect: 'manual' });
    assert.equal(unauthorized.status, 307);
    assert.match(unauthorized.headers.get('location') ?? '', /\/login/);

    await Permission.updateOne({ userId }, { $set: { role: 'member', grants: [] } });
    const deniedPermission = await fetch(new URL('/workspace', baseUrl), { headers: { Cookie: cookieFromLogin }, redirect: 'manual' });
    assert.equal(deniedPermission.status, 404);
    await Permission.updateOne({ userId }, { $set: { role: 'owner', grants: ['profile:read', 'profile:write', 'workspace:read'] } });

    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const recovery = await post('/api/auth/recovery', { email });
    assert.equal(recovery.status, 503);

    const rawResetToken = createOpaqueToken();
    await PasswordResetToken.create({
      userId,
      tokenHash: hashOpaqueToken(rawResetToken),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const reset = await post('/api/auth/reset-password', {
      token: rawResetToken, password: nextPassword, confirmPassword: nextPassword,
    });
    assert.equal(reset.status, 200);
    assert.equal(await Session.countDocuments({ userId }), 0);

    const replay = await post('/api/auth/reset-password', {
      token: rawResetToken, password: nextPassword, confirmPassword: nextPassword,
    });
    assert.equal(replay.status, 400);

    const revoked = await fetch(new URL('/api/auth/me', baseUrl), { headers: { Cookie: cookieFromSignup } });
    assert.equal(revoked.status, 401);

    const oldPasswordLogin = await post('/api/auth/login', { email, password });
    assert.equal(oldPasswordLogin.status, 401);
    const newPasswordLogin = await post('/api/auth/login', { email, password: nextPassword });
    assert.equal(newPasswordLogin.status, 200);
    cookieFromLogin = getCookie(newPasswordLogin);

    const logout = await post('/api/auth/logout', {}, cookieFromLogin);
    assert.equal(logout.status, 200);
    const afterLogout = await fetch(new URL('/api/auth/me', baseUrl), { headers: { Cookie: cookieFromLogin } });
    assert.equal(afterLogout.status, 401);
  } finally {
    if (userId) {
      await Promise.all([
        Session.deleteMany({ userId }),
        PasswordResetToken.deleteMany({ userId }),
        Permission.deleteMany({ userId }),
        Profile.deleteMany({ userId }),
        User.deleteOne({ _id: userId }),
      ]);
    }
    await mongoose.disconnect();
  }
});
