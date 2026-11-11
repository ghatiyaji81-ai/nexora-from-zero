import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from '../src/lib/server/password';
import { loginSchema, passwordResetSchema, signupSchema } from '../src/lib/server/validation';

test('passwords use salted scrypt hashes and reject incorrect values', async () => {
  const password = 'A long test passphrase with enough length!';
  const encoded = await hashPassword(password);

  assert.match(encoded, /^scrypt\$131072\$8\$1\$/);
  assert.notEqual(encoded.includes(password), true);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword(`${password}!`, encoded), false);
  assert.equal(await verifyPassword(password, 'sha256$invalid'), false);
});

test('opaque session and recovery tokens are random format and stored as digests', () => {
  const token = createOpaqueToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashOpaqueToken(token).length, 64);
  assert.notEqual(hashOpaqueToken(token), token);
});

test('auth request validation normalizes email and enforces password confirmation', () => {
  const signup = signupSchema.safeParse({
    fullName: '  Nexora User  ',
    email: '  PERSON@example.com ',
    password: 'A secure long password',
    confirmPassword: 'A secure long password',
  });
  assert.equal(signup.success, true);
  if (signup.success) {
    assert.equal(signup.data.email, 'person@example.com');
    assert.equal(signup.data.fullName, 'Nexora User');
  }

  assert.equal(signupSchema.safeParse({
    fullName: 'Nexora User',
    email: 'person@example.com',
    password: 'A secure long password',
    confirmPassword: 'different passphrase',
  }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'bad', password: 'x' }).success, false);
  assert.equal(passwordResetSchema.safeParse({ token: 'short', password: 'A secure long password', confirmPassword: 'A secure long password' }).success, false);
});
