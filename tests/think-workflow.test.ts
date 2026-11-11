import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/server/db';
import { ThinkConversation } from '../src/models/think-conversation';
import { ThinkDocument } from '../src/models/think-document';
import { ThinkMessage } from '../src/models/think-message';
import { ThinkPreference } from '../src/models/think-preference';
import { Permission } from '../src/models/permission';
import { Profile } from '../src/models/profile';
import { Session } from '../src/models/session';
import { User } from '../src/models/user';

const baseUrl = process.env.NEXORA_TEST_ORIGIN ?? 'http://127.0.0.1:3001';
const origin = process.env.NEXORA_TEST_ORIGIN_HEADER ?? new URL(baseUrl).origin;
const testAddress = `think-test-${randomUUID()}`;
const password = 'Correct horse battery staple 82!';

async function post(path: string, data: unknown, cookie?: string) {
  return fetch(new URL(path, baseUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-real-ip': testAddress, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(data), redirect: 'manual',
  });
}

async function request(path: string, cookie?: string, init: RequestInit = {}) {
  return fetch(new URL(path, baseUrl), { ...init, headers: { Origin: origin, 'x-real-ip': testAddress, ...(cookie ? { Cookie: cookie } : {}), ...init.headers }, redirect: 'manual' });
}

async function signup(label: string) {
  const email = `think-${label}-${randomUUID()}@example.test`;
  const response = await post('/api/auth/signup', { fullName: `Think ${label}`, email, password, confirmPassword: password });
  assert.equal(response.status, 201);
  const body = await response.json() as { user: { id: string } };
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  assert.match(setCookie, /HttpOnly/i);
  return { id: body.user.id, email, cookie: setCookie.split(';', 1)[0] };
}

test('THINK conversations, preferences, documents, and owner checks persist through authenticated APIs', async () => {
  await connectToDatabase();
  const owners: string[] = [];
  const uploadedFileIds: mongoose.Types.ObjectId[] = [];
  let conversationId: string | undefined;
  try {
    const owner = await signup('owner');
    const outsider = await signup('outsider');
    owners.push(owner.id, outsider.id);

    const privatePage = await fetch(new URL('/think', baseUrl), { redirect: 'manual' });
    assert.equal(privatePage.status, 307);
    assert.match(privatePage.headers.get('location') ?? '', /\/login\?next=%2Fthink/);
    const page = await fetch(new URL('/think', baseUrl), { headers: { Cookie: owner.cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /INTELLIGENCE CENTER/);

    const initialSettingsResponse = await request('/api/think/settings', owner.cookie);
    assert.equal(initialSettingsResponse.status, 200);
    const initialSettings = await initialSettingsResponse.json() as { provider: { configured: boolean; models: string[] }; preference: { model: string; agent: string } };
    assert.ok(initialSettings.provider.models.length > 0);
    assert.equal(typeof initialSettings.provider.configured, 'boolean');
    const secretBody = JSON.stringify(initialSettings);
    assert.equal(secretBody.includes('OPENAI_API_KEY'), false);

    const preferenceResponse = await request('/api/think/settings', owner.cookie, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: initialSettings.preference.model, agent: 'research' }) });
    assert.equal(preferenceResponse.status, 200);
    assert.equal((await preferenceResponse.json() as { preference: { agent: string } }).preference.agent, 'research');
    const foreignPreference = await request('/api/think/settings', outsider.cookie);
    assert.equal((await foreignPreference.json() as { preference: { agent: string } }).preference.agent, 'general');

    const create = await post('/api/think/conversations', { title: 'Private research notes', agent: 'research' }, owner.cookie);
    assert.equal(create.status, 201);
    const created = await create.json() as { conversation: { id: string; model: string; agent: string } };
    conversationId = created.conversation.id;
    assert.equal(created.conversation.agent, 'research');
    assert.equal(typeof created.conversation.model, 'string');
    const listed = await request('/api/think/conversations', owner.cookie);
    assert.ok((await listed.json() as { conversations: Array<{ id: string }> }).conversations.some(item => item.id === conversationId));
    assert.equal((await request(`/api/think/conversations/${conversationId}`, outsider.cookie)).status, 404);
    assert.equal((await request(`/api/think/conversations/${conversationId}/messages`, outsider.cookie)).status, 404);
    assert.equal((await request(`/api/think/conversations/${conversationId}`, outsider.cookie, { method: 'DELETE' })).status, 404);

    const fileForm = new FormData();
    fileForm.set('file', new File(['NEXORA document text.\nA second section.'], 'private-notes.txt', { type: 'text/plain' }));
    const upload = await request('/api/think/documents', owner.cookie, { method: 'POST', body: fileForm });
    assert.equal(upload.status, 201);
    const uploaded = await upload.json() as { document: { id: string; name: string; mimeType: string } };
    assert.equal(uploaded.document.name, 'private-notes.txt');
    assert.equal(uploaded.document.mimeType, 'text/plain');
    const metadata = await ThinkDocument.findById(uploaded.document.id).select('+extractedText').lean();
    assert.ok(metadata?.extractedText.includes('NEXORA document text.'));
    uploadedFileIds.push(metadata!.fileId);
    const preview = await request(`/api/think/documents/${uploaded.document.id}`, owner.cookie);
    assert.match((await preview.json() as { document: { preview: string } }).document.preview, /NEXORA document text/);
    assert.equal((await request(`/api/think/documents/${uploaded.document.id}`, outsider.cookie)).status, 404);
    assert.equal((await request(`/api/think/documents/${uploaded.document.id}`, outsider.cookie, { method: 'DELETE' })).status, 404);

    const storedPreference = await ThinkPreference.findOne({ ownerId: owner.id }).lean();
    assert.equal(storedPreference?.agent, 'research');
    const storedConversation = await ThinkConversation.findById(conversationId).lean();
    assert.equal(storedConversation?.ownerId.toString(), owner.id);

    if (!initialSettings.provider.configured) {
      const unavailable = await post(`/api/think/conversations/${conversationId}/messages`, { content: 'This must not create a fabricated AI response.' }, owner.cookie);
      assert.equal(unavailable.status, 503);
      assert.equal(await ThinkMessage.countDocuments({ conversationId }), 0);
    }

    const archive = await request(`/api/think/conversations/${conversationId}`, owner.cookie, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true, title: 'Archived research' }) });
    assert.equal(archive.status, 200);
    const archivedList = await request('/api/think/conversations?archived=1', owner.cookie);
    assert.ok((await archivedList.json() as { conversations: Array<{ id: string; title: string }> }).conversations.some(item => item.id === conversationId && item.title === 'Archived research'));
    const deleteResponse = await request(`/api/think/conversations/${conversationId}`, owner.cookie, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 200);
    conversationId = undefined;

    const deleteDocument = await request(`/api/think/documents/${uploaded.document.id}`, owner.cookie, { method: 'DELETE' });
    assert.equal(deleteDocument.status, 200);
    uploadedFileIds.length = 0;
    assert.equal(await ThinkDocument.countDocuments({ ownerId: owner.id }), 0);
  } finally {
    if (conversationId) {
      await Promise.all([ThinkMessage.deleteMany({ conversationId }), ThinkConversation.deleteOne({ _id: conversationId })]);
    }
    if (uploadedFileIds.length && mongoose.connection.db) {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'think_documents' });
      await Promise.all(uploadedFileIds.map(id => bucket.delete(id).catch(() => undefined)));
    }
    if (owners.length) {
      const ownerIds = owners.map(id => new mongoose.Types.ObjectId(id));
      await Promise.all([
        ThinkMessage.deleteMany({ ownerId: { $in: ownerIds } }),
        ThinkConversation.deleteMany({ ownerId: { $in: ownerIds } }),
        ThinkDocument.deleteMany({ ownerId: { $in: ownerIds } }),
        ThinkPreference.deleteMany({ ownerId: { $in: ownerIds } }),
        Session.deleteMany({ userId: { $in: ownerIds } }),
        Permission.deleteMany({ userId: { $in: ownerIds } }),
        Profile.deleteMany({ userId: { $in: ownerIds } }),
        User.deleteMany({ _id: { $in: ownerIds } }),
      ]);
    }
    await mongoose.disconnect();
  }
});
