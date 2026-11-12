import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/server/db';
import { CreateAsset } from '../src/models/create-asset';
import { CreateExport } from '../src/models/create-export';
import { CreateProject } from '../src/models/create-project';
import { CreateProjectVersion } from '../src/models/create-project-version';
import { Permission } from '../src/models/permission';
import { Profile } from '../src/models/profile';
import { Session } from '../src/models/session';
import { User } from '../src/models/user';

const baseUrl = process.env.NEXORA_TEST_ORIGIN ?? 'http://127.0.0.1:3001';
const origin = process.env.NEXORA_TEST_ORIGIN_HEADER ?? new URL(baseUrl).origin;
const testAddress = `create-test-${randomUUID()}`;
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
  const email = `create-${label}-${randomUUID()}@example.test`;
  const response = await post('/api/auth/signup', { fullName: `Create ${label}`, email, password, confirmPassword: password });
  assert.equal(response.status, 201);
  const body = await response.json() as { user: { id: string } };
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  return { id: body.user.id, cookie: cookie.split(';', 1)[0] };
}

test('CREATE projects, versions, exports, private assets and owner isolation persist through APIs', async () => {
  await connectToDatabase();
  const owners: string[] = [];
  const fileIds: mongoose.Types.ObjectId[] = [];
  const projectIds: string[] = [];
  try {
    const owner = await signup('owner');
    const outsider = await signup('outsider');
    owners.push(owner.id, outsider.id);

    const createdResponse = await post('/api/create/projects', { title: 'Private campaign', category: 'marketing' }, owner.cookie);
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { project: { id: string; projectType: string; revision: number } };
    projectIds.push(created.project.id);
    assert.equal(created.project.projectType, 'design');
    assert.equal(created.project.revision, 0);

    const listed = await request('/api/create/projects?q=campaign', owner.cookie);
    assert.ok((await listed.json() as { projects: Array<{ id: string }> }).projects.some(item => item.id === created.project.id));
    assert.equal((await request(`/api/create/projects/${created.project.id}`, outsider.cookie)).status, 404);
    assert.equal((await request(`/api/create/projects/${created.project.id}`, outsider.cookie, { method: 'DELETE' })).status, 404);

    const save = await request(`/api/create/projects/${created.project.id}`, owner.cookie, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Campaign draft', revision: 0, data: { width: 900, height: 600, background: '#ffffff', elements: [{ id: 'one', type: 'text', text: 'Private copy' }] } }),
    });
    assert.equal(save.status, 200);
    const saved = await save.json() as { project: { revision: number; data: { elements: Array<{ text: string }> } } };
    assert.equal(saved.project.revision, 1);
    assert.equal(saved.project.data.elements[0].text, 'Private copy');
    const staleSave = await request(`/api/create/projects/${created.project.id}`, owner.cookie, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Stale', revision: 0 }),
    });
    assert.equal(staleSave.status, 409);

    const versionResponse = await request(`/api/create/projects/${created.project.id}/versions`, owner.cookie);
    const savedVersions = (await versionResponse.json() as { versions: Array<{ id: string }> }).versions;
    assert.equal(savedVersions.length, 1);
    const restored = await request(`/api/create/projects/${created.project.id}/versions?versionId=${savedVersions[0].id}`, owner.cookie, { method: 'POST' });
    assert.equal(restored.status, 200);
    const restoredProject = (await restored.json() as { project: { revision: number; data: { elements: unknown[] } } }).project;
    assert.equal(restoredProject.revision, 2);
    assert.equal(restoredProject.data.elements.length, 0);
    const foreignVersions = await request(`/api/create/projects/${created.project.id}/versions`, outsider.cookie);
    assert.equal((await foreignVersions.json() as { error?: string }).error, 'Project not found.');

    const exportResponse = await post(`/api/create/projects/${created.project.id}/exports`, { format: 'png' }, owner.cookie);
    assert.equal(exportResponse.status, 201);
    assert.equal((await request('/api/create/exports', owner.cookie)).status, 200);
    assert.equal((await request(`/api/create/projects/${created.project.id}/exports`, outsider.cookie)).status, 404);

    const form = new FormData();
    form.set('file', new File(['A private library note.'], 'private-note.txt', { type: 'text/plain' }));
    form.set('projectId', created.project.id);
    const upload = await request('/api/create/assets', owner.cookie, { method: 'POST', body: form });
    assert.equal(upload.status, 201);
    const asset = (await upload.json() as { asset: { id: string; url: string; name: string } }).asset;
    const stored = await CreateAsset.findById(asset.id).lean();
    assert.ok(stored);
    fileIds.push(stored.fileId);
    const download = await request(asset.url, owner.cookie);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), 'A private library note.');
    const range = await request(asset.url, owner.cookie, { headers: { Range: 'bytes=0-4' } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), 'A pri');
    assert.equal((await request(asset.url, outsider.cookie)).status, 404);

    const updateAsset = await request(`/api/create/assets/${asset.id}`, owner.cookie, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'renamed.txt', folder: 'Campaign', tags: ['copy', 'draft'], favorite: true }),
    });
    assert.equal(updateAsset.status, 200);
    assert.equal((await request(`/api/create/assets/${asset.id}`, outsider.cookie, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: true }) })).status, 404);
    assert.equal((await request(`/api/create/assets/${asset.id}`, outsider.cookie, { method: 'DELETE' })).status, 404);

    const duplicate = await post('/api/create/projects', { title: 'Campaign copy', category: 'marketing', duplicateId: created.project.id }, owner.cookie);
    assert.equal(duplicate.status, 201);
    projectIds.push((await duplicate.json() as { project: { id: string } }).project.id);

    const archive = await request(`/api/create/projects/${created.project.id}`, owner.cookie, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'archived', favorite: true, revision: 1 }),
    });
    assert.equal(archive.status, 200);
    assert.equal((await request('/api/create/projects?status=archived&favorite=1', owner.cookie)).status, 200);

    const removeAsset = await request(`/api/create/assets/${asset.id}`, owner.cookie, { method: 'DELETE' });
    assert.equal(removeAsset.status, 200);
    fileIds.length = 0;
  } finally {
    const ownerIds = owners.map(id => new mongoose.Types.ObjectId(id));
    if (owners.length) {
      const assets = await CreateAsset.find({ ownerId: { $in: ownerIds } }).select('fileId').lean();
      fileIds.push(...assets.map(asset => asset.fileId));
      const bucket = mongoose.connection.db ? new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'create_assets' }) : null;
      if (bucket) await Promise.all(fileIds.map(id => bucket.delete(id).catch(() => undefined)));
      await Promise.all([
        CreateAsset.deleteMany({ ownerId: { $in: ownerIds } }),
        CreateProjectVersion.deleteMany({ ownerId: { $in: ownerIds } }),
        CreateExport.deleteMany({ ownerId: { $in: ownerIds } }),
        CreateProject.deleteMany({ ownerId: { $in: ownerIds } }),
        Session.deleteMany({ userId: { $in: ownerIds } }),
        Permission.deleteMany({ userId: { $in: ownerIds } }),
        Profile.deleteMany({ userId: { $in: ownerIds } }),
        User.deleteMany({ _id: { $in: ownerIds } }),
      ]);
    }
    await mongoose.disconnect();
  }
});
