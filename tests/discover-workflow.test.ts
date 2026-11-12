import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/server/db';
import { DiscoverBookmark } from '../src/models/discover-bookmark';
import { DiscoverCollection } from '../src/models/discover-collection';
import { DiscoverEvidence } from '../src/models/discover-evidence';
import { DiscoverResearchReport } from '../src/models/discover-research-report';
import { DiscoverResearchTask } from '../src/models/discover-research-task';
import { DiscoverSearch } from '../src/models/discover-search';
import { DiscoverSource } from '../src/models/discover-source';
import { ThinkDocument } from '../src/models/think-document';
import { Permission } from '../src/models/permission';
import { Profile } from '../src/models/profile';
import { Session } from '../src/models/session';
import { User } from '../src/models/user';

const baseUrl = process.env.NEXORA_TEST_ORIGIN ?? 'http://127.0.0.1:3001';
const origin = process.env.NEXORA_TEST_ORIGIN_HEADER ?? new URL(baseUrl).origin;
const testAddress = `discover-test-${randomUUID()}`;
const password = 'Correct horse battery staple 82!';

async function post(path: string, data: unknown, cookie?: string) {
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
  const email = `discover-${label}-${randomUUID()}@example.test`;
  const response = await post('/api/auth/signup', { fullName: `Discover ${label}`, email, password, confirmPassword: password });
  assert.equal(response.status, 201);
  const body = await response.json() as { user: { id: string } };
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  return { id: body.user.id, cookie: cookie.split(';', 1)[0] };
}

test('DISCOVER local search, collections, evidence reports and owner isolation persist through APIs', async () => {
  await connectToDatabase();
  const ownerIds: string[] = [];
  const documentIds: mongoose.Types.ObjectId[] = [];
  try {
    const owner = await signup('owner');
    ownerIds.push(owner.id);
    const outsider = await signup('outsider');
    ownerIds.push(outsider.id);
    assert.equal((await request('/api/discover/collections')).status, 401);

    const docOwner = new mongoose.Types.ObjectId(owner.id);
    const ownDocument = await ThinkDocument.create({
      ownerId: docOwner,
      fileId: new mongoose.Types.ObjectId(),
      name: 'Research notes.txt',
      mimeType: 'text/plain',
      size: 44,
      sha256: 'a'.repeat(64),
      extractedText: 'A private finding about secure local research methods.',
    });
    const foreignDocument = await ThinkDocument.create({
      ownerId: new mongoose.Types.ObjectId(outsider.id),
      fileId: new mongoose.Types.ObjectId(),
      name: 'Foreign notes.txt',
      mimeType: 'text/plain',
      size: 42,
      sha256: 'b'.repeat(64),
      extractedText: 'A private finding about secure local research methods.',
    });
    documentIds.push(ownDocument._id, foreignDocument._id);

    const collectionResponse = await post('/api/discover/collections', { title: `Security research ${randomUUID()}` }, owner.cookie);
    assert.equal(collectionResponse.status, 201);
    const collection = (await collectionResponse.json() as { collection: { id: string } }).collection;
    assert.equal((await request(`/api/discover/collections/${collection.id}`, outsider.cookie, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'stolen collection' }),
    })).status, 404);

    const searchResponse = await post('/api/discover/search', { query: 'secure local research', exactPhrase: false }, owner.cookie);
    assert.equal(searchResponse.status, 200);
    const result = (await searchResponse.json() as { results: Array<{ documentId: string; start: number; end: number }> }).results;
    assert.equal(result.length, 1);
    assert.equal(result[0].documentId, ownDocument._id.toString());

    const sourceResponse = await post('/api/discover/sources', {
      documentId: ownDocument._id.toString(),
      start: result[0].start, end: result[0].end, collectionId: collection.id,
    }, owner.cookie);
    assert.equal(sourceResponse.status, 201);
    const source = (await sourceResponse.json() as { source: { id: string } }).source;
    assert.equal((await request('/api/discover/sources', outsider.cookie)).status, 200);
    const outsiderSources = await (await request('/api/discover/sources', outsider.cookie)).json() as { sources: unknown[] };
    assert.equal(outsiderSources.sources.length, 0);

    const reportResponse = await post('/api/discover/research', {
      question: 'What does the saved document say about research?',
      sourceIds: [source.id],
    }, owner.cookie);
    assert.equal(reportResponse.status, 201);
    const report = (await reportResponse.json() as { report: { id: string; markdown: string }; task: { status: string } });
    assert.equal(report.task.status, 'complete');
    assert.match(report.report.markdown, /secure local research methods/);
    assert.equal((await request(`/api/discover/research/${report.report.id}`, outsider.cookie)).status, 404);
    assert.equal((await request(`/api/discover/sources/${source.id}`, outsider.cookie, { method: 'DELETE' })).status, 404);
  } finally {
    if (ownerIds.length) {
      const ownerObjectIds = ownerIds.map(id => new mongoose.Types.ObjectId(id));
      const filter = { ownerId: { $in: ownerObjectIds } };
      await Promise.all([
        DiscoverEvidence.deleteMany(filter), DiscoverResearchReport.deleteMany(filter),
        DiscoverResearchTask.deleteMany(filter), DiscoverBookmark.deleteMany(filter),
        DiscoverSource.deleteMany(filter), DiscoverCollection.deleteMany(filter),
        DiscoverSearch.deleteMany(filter), ThinkDocument.deleteMany({ _id: { $in: documentIds } }),
        Session.deleteMany({ userId: { $in: ownerObjectIds } }),
        Permission.deleteMany({ userId: { $in: ownerObjectIds } }),
        Profile.deleteMany({ userId: { $in: ownerObjectIds } }),
        User.deleteMany({ _id: { $in: ownerObjectIds } }),
      ]);
    }
  }
});
