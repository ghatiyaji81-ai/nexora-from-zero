import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/server/db';
import { ThinkConversation } from '../src/models/think-conversation';
import { ThinkMessage } from '../src/models/think-message';
import { SpeakRecording } from '../src/models/speak-recording';
import { Permission } from '../src/models/permission';
import { Profile } from '../src/models/profile';
import { Session } from '../src/models/session';
import { User } from '../src/models/user';

const baseUrl = process.env.NEXORA_TEST_ORIGIN ?? 'http://127.0.0.1:3001';
const origin = process.env.NEXORA_TEST_ORIGIN_HEADER ?? new URL(baseUrl).origin;
const testAddress = `speak-test-${randomUUID()}`;
const password = 'Correct horse battery staple 82!';

async function postJson(path: string, data: unknown, cookie?: string) {
  return fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, 'x-real-ip': testAddress, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(data),
    redirect: 'manual',
  });
}

async function request(path: string, cookie?: string, init: RequestInit = {}) {
  return fetch(new URL(path, baseUrl), {
    ...init,
    headers: { Origin: origin, 'x-real-ip': testAddress, ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
    redirect: 'manual',
  });
}

async function signup(label: string) {
  const email = `speak-${label}-${randomUUID()}@example.test`;
  const response = await postJson('/api/auth/signup', { fullName: `Speak ${label}`, email, password, confirmPassword: password });
  assert.equal(response.status, 201);
  const body = await response.json() as { user: { id: string } };
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  assert.match(setCookie, /HttpOnly/i);
  return { id: body.user.id, cookie: setCookie.split(';', 1)[0] };
}

test('SPEAK recordings require authentication and enforce owner isolation for upload, attachment, playback, and delete', async () => {
  const unauthorized = await request('/api/speak/recordings');
  assert.equal(unauthorized.status, 401);
  assert.equal(((await unauthorized.json()) as { error: string }).error, 'Sign in to use SPEAK.');
  const protectedPage = await fetch(new URL('/speak', baseUrl), { redirect: 'manual' });
  assert.equal(protectedPage.status, 307);
  assert.match(protectedPage.headers.get('location') ?? '', /\/login\?next=%2Fspeak/);
  await connectToDatabase();
  const owners: mongoose.Types.ObjectId[] = [];
  const uploadedFileIds: mongoose.Types.ObjectId[] = [];
  let conversationId: string | undefined;
  try {
    const owner = await signup('owner');
    const outsider = await signup('outsider');
    owners.push(new mongoose.Types.ObjectId(owner.id), new mongoose.Types.ObjectId(outsider.id));
    const privatePage = await fetch(new URL('/speak', baseUrl), { headers: { Cookie: owner.cookie } });
    assert.equal(privatePage.status, 200);
    assert.match(await privatePage.text(), /VOICE INTELLIGENCE/);

    const conversationResponse = await postJson('/api/think/conversations', { title: 'Voice notes' }, owner.cookie);
    assert.equal(conversationResponse.status, 201);
    conversationId = ((await conversationResponse.json()) as { conversation: { id: string } }).conversation.id;

    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03]);
    const foreignConversationForm = new FormData();
    foreignConversationForm.set('audio', new File([bytes], 'recording.webm', { type: 'audio/webm' }));
    foreignConversationForm.set('durationMs', '1200');
    foreignConversationForm.set('conversationId', conversationId);
    const foreignConversationUpload = await request('/api/speak/recordings', outsider.cookie, { method: 'POST', body: foreignConversationForm });
    assert.equal(foreignConversationUpload.status, 404);

    const form = new FormData();
    form.set('audio', new File([bytes], 'recording.webm', { type: 'audio/webm' }));
    form.set('durationMs', '1200');
    form.set('transcript', 'A private voice note.');
    form.set('conversationId', conversationId);
    const upload = await request('/api/speak/recordings', owner.cookie, { method: 'POST', body: form });
    assert.equal(upload.status, 201);
    const created = (await upload.json() as { recording: { id: string; conversationId: string; transcript: string } }).recording;
    assert.equal(created.conversationId, conversationId);
    assert.equal(created.transcript, 'A private voice note.');

    const stored = await SpeakRecording.findById(created.id).lean();
    assert.ok(stored);
    uploadedFileIds.push(stored.fileId);
    assert.equal(stored.ownerId.toString(), owner.id);

    const ownAudio = await request(`/api/speak/recordings/${created.id}/audio`, owner.cookie);
    assert.equal(ownAudio.status, 200);
    assert.equal(ownAudio.headers.get('content-type'), 'audio/webm');
    assert.deepEqual([...new Uint8Array(await ownAudio.arrayBuffer())], [...bytes]);
    const outsiderList = await request('/api/speak/recordings', outsider.cookie);
    assert.equal(outsiderList.status, 200);
    assert.equal(((await outsiderList.json()) as { recordings: unknown[] }).recordings.length, 0);
    assert.equal((await request(`/api/speak/recordings/${created.id}/audio`, outsider.cookie)).status, 404);
    assert.equal((await request(`/api/speak/recordings/${created.id}`, outsider.cookie, { method: 'DELETE' })).status, 404);
    assert.equal((await request(`/api/speak/recordings/${created.id}`, outsider.cookie, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId }),
    })).status, 404);

    const invalidForm = new FormData();
    invalidForm.set('audio', new File(['not audio'], 'voice.webm', { type: 'audio/webm' }));
    invalidForm.set('durationMs', '20');
    const invalid = await request('/api/speak/recordings', owner.cookie, { method: 'POST', body: invalidForm });
    assert.equal(invalid.status, 415);

    const deletion = await request(`/api/speak/recordings/${created.id}`, owner.cookie, { method: 'DELETE' });
    assert.equal(deletion.status, 200);
    uploadedFileIds.length = 0;
    assert.equal(await SpeakRecording.countDocuments({ _id: created.id }), 0);
  } finally {
    if (uploadedFileIds.length && mongoose.connection.db) {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'speak_recordings' });
      await Promise.all(uploadedFileIds.map(id => bucket.delete(id).catch(() => undefined)));
    }
    if (owners.length) {
      const ownerFilter = { $in: owners };
      const recordings = await SpeakRecording.find({ ownerId: ownerFilter }).select('fileId').lean();
      if (mongoose.connection.db && recordings.length) {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'speak_recordings' });
        await Promise.all(recordings.map(recording => bucket.delete(recording.fileId).catch(() => undefined)));
      }
      await Promise.all([
        SpeakRecording.deleteMany({ ownerId: ownerFilter }),
        ThinkMessage.deleteMany({ ownerId: ownerFilter }),
        ThinkConversation.deleteMany({ ownerId: ownerFilter }),
        Session.deleteMany({ userId: ownerFilter }),
        Permission.deleteMany({ userId: ownerFilter }),
        Profile.deleteMany({ userId: ownerFilter }),
        User.deleteMany({ _id: ownerFilter }),
      ]);
    }
    await mongoose.disconnect();
  }
});
