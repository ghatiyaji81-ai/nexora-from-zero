import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/server/db';
import { Conversation } from '../src/models/conversation';
import { Message } from '../src/models/message';
import { Permission } from '../src/models/permission';
import { Presence } from '../src/models/presence';
import { Profile } from '../src/models/profile';
import { Session } from '../src/models/session';
import { TypingState } from '../src/models/typing-state';
import { User } from '../src/models/user';

const baseUrl = process.env.NEXORA_TEST_ORIGIN ?? 'http://127.0.0.1:3001';
const origin = process.env.NEXORA_TEST_ORIGIN_HEADER ?? new URL(baseUrl).origin;
const password = 'Correct horse battery staple 82!';
const testAddress = `connect-test-${randomUUID()}`;

async function post(path: string, data: unknown, cookie?: string) {
  return fetch(new URL(path, baseUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-real-ip': testAddress, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(data), redirect: 'manual',
  });
}

async function signup(label: string) {
  const email = `connect-${label}-${randomUUID()}@example.test`;
  const response = await post('/api/auth/signup', { fullName: `Connect ${label}`, email, password, confirmPassword: password });
  assert.equal(response.status, 201);
  const body = await response.json() as { user: { id: string } };
  return { id: body.user.id, email };
}

async function login(email: string) {
  const response = await post('/api/auth/login', { email, password });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  return setCookie.split(';', 1)[0];
}

async function request(path: string, cookie?: string, init: RequestInit = {}) {
  return fetch(new URL(path, baseUrl), {
    ...init,
    headers: { Origin: origin, 'x-real-ip': testAddress, ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
    redirect: 'manual',
  });
}

async function json<T>(response: Response) {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) assert.fail(`Expected success, got ${response.status}: ${body.error ?? ''}`);
  return body;
}

const sseBuffers = new WeakMap<ReadableStreamDefaultReader<Uint8Array>, string>();

async function waitForSseEvent(reader: ReadableStreamDefaultReader<Uint8Array>, eventName: string, carry = '') {
  const decoder = new TextDecoder();
  let text = carry || sseBuffers.get(reader) || '';
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const separator = text.indexOf('\n\n');
    if (separator >= 0) {
      const block = text.slice(0, separator);
      text = text.slice(separator + 2);
      if (block.split('\n').some(line => line === `event: ${eventName}`)) {
        sseBuffers.set(reader, text);
        return { text };
      }
      continue;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for SSE ${eventName}.`)), Math.max(1, deadline - Date.now())); });
    let next: ReadableStreamReadResult<Uint8Array>;
    try { next = await Promise.race([reader.read(), timeout]); }
    finally { if (timer) clearTimeout(timer); }
    if (next.done) throw new Error('SSE stream ended early.');
    text += decoder.decode(next.value, { stream: true });
  }
  throw new Error(`Timed out waiting for SSE ${eventName}.`);
}

function createPngFixture() {
  function crc32(bytes: Uint8Array) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type: string, data: Uint8Array) {
    const result = Buffer.alloc(12 + data.length);
    result.writeUInt32BE(data.length, 0);
    result.write(type, 4, 4, 'ascii');
    Buffer.from(data).copy(result, 8);
    const checksumInput = result.subarray(4, 8 + data.length);
    result.writeUInt32BE(crc32(checksumInput), 8 + data.length);
    return result;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 0xff, 0, 0, 0xff]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('Connect supports separate authenticated sessions, live messages, groups, receipts, attachments, and access control', { timeout: 120_000 }, async () => {
  await connectToDatabase();
  const createdConversationIds: mongoose.Types.ObjectId[] = [];
  const createdUsers: mongoose.Types.ObjectId[] = [];
  let sseResponse: Response | undefined;
  let sseReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let groupReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const uploadedFileIds: mongoose.Types.ObjectId[] = [];

  try {
    const first = await signup('First');
    createdUsers.push(new mongoose.Types.ObjectId(first.id));
    const second = await signup('Second');
    createdUsers.push(new mongoose.Types.ObjectId(second.id));
    const outsider = await signup('Outsider');
    createdUsers.push(new mongoose.Types.ObjectId(outsider.id));
    const firstCookie = await login(first.email);
    const secondCookie = await login(second.email);
    const outsiderCookie = await login(outsider.email);
    assert.notEqual(firstCookie, secondCookie);
    const directResult = await json<{ conversationId: string }>(await post('/api/connect/conversations/direct', { userId: second.id }, firstCookie));
    const directId = new mongoose.Types.ObjectId(directResult.conversationId);
    createdConversationIds.push(directId);

    sseResponse = await request(`/api/connect/conversations/${directId}/events`, secondCookie);
    assert.equal(sseResponse.status, 200);
    assert.match(sseResponse.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.ok(sseResponse.body);
    sseReader = sseResponse.body.getReader();
    await waitForSseEvent(sseReader, 'ready');
    assert.equal((await post('/api/connect/presence', {}, secondCookie)).status, 200);
    const onlineList = await json<{ conversations: Array<{ id: string; members: Array<{ id: string; online: boolean }> }> }>(await request('/api/connect/conversations', firstCookie));
    assert.equal(onlineList.conversations.find(item => item.id === directId.toString())?.members.find(member => member.id === second.id)?.online, true);
    assert.equal((await post(`/api/connect/conversations/${directId}/actions`, { action: 'typing', active: true }, firstCookie)).status, 200);
    await waitForSseEvent(sseReader, 'typing');
    assert.equal((await post(`/api/connect/conversations/${directId}/actions`, { action: 'typing', active: false }, firstCookie)).status, 200);

    const sent = await json<{ messageId: string }>(await post(`/api/connect/conversations/${directId}/messages`, { body: 'A live message across separate sessions.' }, firstCookie));
    await waitForSseEvent(sseReader, 'message');
    const unreadList = await json<{ conversations: Array<{ id: string; unreadCount: number }> }>(await request('/api/connect/conversations', secondCookie));
    assert.equal(unreadList.conversations.find(item => item.id === directId.toString())?.unreadCount, 1);
    const receivedHistory = await json<{ messages: Array<{ id: string; body: string; deliveredTo: Array<{ userId: string }>; readBy: Array<{ userId: string }> }> }>(await request(`/api/connect/conversations/${directId}/messages`, secondCookie));
    const received = receivedHistory.messages.find(message => message.id === sent.messageId);
    assert.ok(received);
    assert.equal(received.body, 'A live message across separate sessions.');
    assert.ok(received.deliveredTo.some(receipt => receipt.userId === second.id));
    assert.equal((await post(`/api/connect/conversations/${directId}/read`, {}, secondCookie)).status, 200);
    const readHistory = await json<{ messages: Array<{ id: string; readBy: Array<{ userId: string }> }> }>(await request(`/api/connect/conversations/${directId}/messages`, firstCookie));
    assert.ok(readHistory.messages.find(message => message.id === sent.messageId)?.readBy.some(receipt => receipt.userId === second.id));

    const reply = await json<{ messageId: string }>(await post(`/api/connect/conversations/${directId}/messages`, { body: 'A reply.', replyTo: sent.messageId }, secondCookie));
    await post(`/api/connect/conversations/${directId}/messages`, { body: 'A message on the previous page.' }, firstCookie);
    const firstPage = await json<{ hasMore: boolean; messages: Array<{ body: string }> }>(await request(`/api/connect/conversations/${directId}/messages?limit=2`, firstCookie));
    assert.equal(firstPage.messages.length, 2);
    assert.equal(firstPage.hasMore, true);
    assert.equal((await post(`/api/connect/conversations/${directId}/actions`, { action: 'react', messageId: sent.messageId, emoji: '❤️' }, secondCookie)).status, 200);
    assert.equal((await post(`/api/connect/conversations/${directId}/actions`, { action: 'edit', messageId: sent.messageId, body: 'An edited message.' }, firstCookie)).status, 200);
    const search = await json<{ messages: Array<{ id: string; body: string }> }>(await request('/api/connect/search?q=edited%20message', firstCookie));
    assert.ok(search.messages.some(message => message.id === sent.messageId));
    const historyAfterActions = await json<{ messages: Array<{ id: string; replyTo?: string; reactions: Array<{ emoji: string }> }> }>(await request(`/api/connect/conversations/${directId}/messages`, firstCookie));
    assert.equal(historyAfterActions.messages.find(message => message.id === reply.messageId)?.replyTo, sent.messageId);
    assert.ok(historyAfterActions.messages.find(message => message.id === sent.messageId)?.reactions.some(reaction => reaction.emoji === '❤️'));
    assert.equal((await post(`/api/connect/conversations/${directId}/actions`, { action: 'delete-self', messageId: reply.messageId }, secondCookie)).status, 200);

    const group = await json<{ conversationId: string }>(await post('/api/connect/conversations', { name: 'Connect Test Group', description: 'Private workflow', memberIds: [second.id] }, firstCookie));
    const groupId = new mongoose.Types.ObjectId(group.conversationId);
    createdConversationIds.push(groupId);
    const groupSse = await request(`/api/connect/conversations/${groupId}/events`, secondCookie);
    assert.equal(groupSse.status, 200);
    groupReader = groupSse.body!.getReader();
    await waitForSseEvent(groupReader, 'ready');
    const groupMessage = await json<{ messageId: string }>(await post(`/api/connect/conversations/${groupId}/messages`, { body: 'Hello, group.' }, firstCookie));
    await waitForSseEvent(groupReader, 'message');
    const groupHistory = await json<{ messages: Array<{ id: string; body: string }> }>(await request(`/api/connect/conversations/${groupId}/messages`, secondCookie));
    assert.equal(groupHistory.messages.find(message => message.id === groupMessage.messageId)?.body, 'Hello, group.');
    const deniedGroupAdmin = await post(`/api/connect/conversations/${groupId}/members`, { action: 'remove', userId: first.id }, secondCookie);
    assert.equal(deniedGroupAdmin.status, 403);
    const firstGroupSse = await request(`/api/connect/conversations/${groupId}/events`, firstCookie);
    const firstGroupReader = firstGroupSse.body!.getReader();
    await waitForSseEvent(firstGroupReader, 'ready');
    assert.equal((await post(`/api/connect/conversations/${groupId}/members`, { action: 'admin', userId: second.id, enabled: true }, firstCookie)).status, 200);
    assert.equal((await post(`/api/connect/conversations/${groupId}/actions`, { action: 'delete-everyone', messageId: groupMessage.messageId }, secondCookie)).status, 200);
    assert.equal((await post(`/api/connect/conversations/${groupId}/members`, { action: 'remove', userId: first.id }, secondCookie)).status, 200);
    await waitForSseEvent(firstGroupReader, 'revoked');
    assert.equal((await request(`/api/connect/conversations/${groupId}/messages`, firstCookie)).status, 404);
    await firstGroupReader.cancel();

    const bytes = new Uint8Array(createPngFixture());
    const form = new FormData();
    form.set('conversationId', directId.toString());
    form.set('file', new Blob([bytes], { type: 'image/png' }), 'small.png');
    const uploadResponse = await request('/api/connect/attachments', firstCookie, { method: 'POST', body: form });
    const uploaded = await json<{ fileId: string; kind: string }>(uploadResponse);
    assert.equal(uploaded.kind, 'image');
    uploadedFileIds.push(new mongoose.Types.ObjectId(uploaded.fileId));
    const fileMessage = await json<{ messageId: string }>(await post(`/api/connect/conversations/${directId}/messages`, { body: '', attachments: [uploaded.fileId] }, firstCookie));
    assert.ok(fileMessage.messageId);
    assert.equal((await post(`/api/connect/conversations/${directId}/messages`, { body: 'Duplicate file reference', attachments: [uploaded.fileId] }, firstCookie)).status, 409);
    const downloaded = await request(`/api/connect/attachments/${uploaded.fileId}`, secondCookie);
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('content-type'), 'image/png');
    assert.equal((await downloaded.arrayBuffer()).byteLength, bytes.byteLength);
    assert.equal((await request(`/api/connect/attachments/${uploaded.fileId}`, outsiderCookie)).status, 404);
    assert.equal((await post(`/api/connect/conversations/${directId}/actions`, { action: 'delete-everyone', messageId: fileMessage.messageId }, firstCookie)).status, 200);
    assert.equal((await request(`/api/connect/attachments/${uploaded.fileId}`, secondCookie)).status, 404);

    const pendingForm = new FormData();
    pendingForm.set('conversationId', directId.toString());
    pendingForm.set('file', new Blob(['pending upload'], { type: 'text/plain' }), 'pending.txt');
    const pendingUpload = await json<{ fileId: string }>(await request('/api/connect/attachments', firstCookie, { method: 'POST', body: pendingForm }));
    assert.equal((await request(`/api/connect/attachments/${pendingUpload.fileId}`, outsiderCookie, { method: 'DELETE' })).status, 404);
    assert.equal((await request(`/api/connect/attachments/${pendingUpload.fileId}`, firstCookie, { method: 'DELETE' })).status, 200);

    const voiceForm = new FormData();
    voiceForm.set('conversationId', directId.toString());
    voiceForm.set('file', new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00])], { type: 'audio/webm;codecs=opus' }), 'voice-message.webm');
    const voiceUpload = await json<{ fileId: string; contentType: string; kind: string }>(await request('/api/connect/attachments', firstCookie, { method: 'POST', body: voiceForm }));
    assert.equal(voiceUpload.contentType, 'audio/webm');
    assert.equal(voiceUpload.kind, 'audio');
    uploadedFileIds.push(new mongoose.Types.ObjectId(voiceUpload.fileId));
    assert.equal((await post(`/api/connect/conversations/${directId}/messages`, { body: '', attachments: [voiceUpload.fileId] }, firstCookie)).status, 201);

    const badForm = new FormData();
    badForm.set('conversationId', directId.toString());
    badForm.set('file', new Blob(['not a PDF'], { type: 'application/pdf' }), 'spoofed.pdf');
    const badUpload = await request('/api/connect/attachments', firstCookie, { method: 'POST', body: badForm });
    assert.equal(badUpload.status, 415);

    assert.equal((await request(`/api/connect/conversations/${directId}/messages`, outsiderCookie)).status, 404);
    assert.equal((await request(`/api/connect/conversations/${groupId}/messages`, outsiderCookie)).status, 404);
    assert.equal((await request(`/api/connect/conversations/${directId}/events`, outsiderCookie)).status, 404);

    const groupList = await json<{ conversations: Array<{ id: string; type: string; unreadCount: number }> }>(await request('/api/connect/conversations', secondCookie));
    assert.ok(groupList.conversations.some(item => item.id === groupId.toString() && item.type === 'group'));
  } finally {
    await sseReader?.cancel().catch(() => undefined);
    await groupReader?.cancel().catch(() => undefined);
    await sseResponse?.body?.cancel().catch(() => undefined);
    await Promise.all(uploadedFileIds.map(async fileId => {
      const database = mongoose.connection.db;
      if (!database) return;
      try { await new mongoose.mongo.GridFSBucket(database, { bucketName: 'connect_attachments' }).delete(fileId); } catch { /* upload failure may precede file creation */ }
    }));
    await Message.deleteMany({ conversationId: { $in: createdConversationIds } });
    await Conversation.deleteMany({ _id: { $in: createdConversationIds } });
    await Promise.all([
      Session.deleteMany({ userId: { $in: createdUsers } }),
      Permission.deleteMany({ userId: { $in: createdUsers } }),
      Profile.deleteMany({ userId: { $in: createdUsers } }),
      Presence.deleteMany({ userId: { $in: createdUsers } }),
      TypingState.deleteMany({ userId: { $in: createdUsers } }),
      User.deleteMany({ _id: { $in: createdUsers } }),
    ]);
    await mongoose.disconnect();
  }
});
