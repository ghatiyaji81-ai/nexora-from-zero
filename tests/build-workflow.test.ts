import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/server/db';
import { readBuildZip, writeBuildZip } from '../src/lib/build-archive';
import { BuildApproval } from '../src/models/build-approval';
import { BuildProject } from '../src/models/build-project';
import { BuildProjectFile } from '../src/models/build-project-file';
import { BuildProjectFileVersion } from '../src/models/build-project-file-version';
import { BuildSecurityScan } from '../src/models/build-security-scan';
import { Permission } from '../src/models/permission';
import { Profile } from '../src/models/profile';
import { Session } from '../src/models/session';
import { User } from '../src/models/user';

const baseUrl = process.env.NEXORA_TEST_ORIGIN ?? 'http://127.0.0.1:3001';
const origin = process.env.NEXORA_TEST_ORIGIN_HEADER ?? new URL(baseUrl).origin;
const testAddress = `build-test-${randomUUID()}`;
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
  const email = `build-${label}-${randomUUID()}@example.test`;
  const response = await post('/api/auth/signup', { fullName: `Build ${label}`, email, password, confirmPassword: password });
  assert.equal(response.status, 201);
  const body = await response.json() as { user: { id: string } };
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  return { id: body.user.id, cookie: cookie.split(';', 1)[0] };
}

test('BUILD project files, snapshots, approved proposals, scanner and ownership persist through APIs', async () => {
  await connectToDatabase();
  const owners: string[] = [];
  let projectId = '';
  try {
    const owner = await signup('owner');
    const outsider = await signup('outsider');
    owners.push(owner.id, outsider.id);

    assert.equal((await request('/api/build/projects')).status, 401);
    const zipBytes = writeBuildZip([
      { path: 'src/imported.ts', content: 'export const imported = true;\n' },
      { path: 'README.md', content: '# Imported safely\n' },
    ]);
    const importResponse = await request('/api/build/projects/import?title=Imported%20sample', owner.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: new Uint8Array(zipBytes),
    });
    assert.equal(importResponse.status, 201);
    const imported = await importResponse.json() as { project: { id: string }; importedFiles: number; executed: boolean };
    assert.equal(imported.importedFiles, 2);
    assert.equal(imported.executed, false);
    assert.equal((await request(`/api/build/projects/${imported.project.id}`, outsider.cookie)).status, 404);
    const zipResponse = await request(`/api/build/projects/${imported.project.id}/zip`, owner.cookie);
    assert.equal(zipResponse.status, 200);
    const roundTrip = readBuildZip(Buffer.from(await zipResponse.arrayBuffer()));
    assert.deepEqual(roundTrip.map(file => file.path), ['README.md', 'src/imported.ts']);
    assert.equal(roundTrip.find(file => file.path === 'src/imported.ts')?.content, 'export const imported = true;\n');
    assert.equal((await request(`/api/build/projects/${imported.project.id}/zip`, outsider.cookie)).status, 404);

    const createdResponse = await post('/api/build/projects', { title: 'Private API', template: 'node' }, owner.cookie);
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { project: { id: string }; files: string[] };
    projectId = created.project.id;
    assert.ok(created.files.includes('src/index.js'));
    assert.equal((await request(`/api/build/projects/${projectId}`, outsider.cookie)).status, 404);
    assert.equal((await request(`/api/build/projects/${projectId}`, outsider.cookie, { method: 'DELETE' })).status, 404);

    const filesResponse = await request(`/api/build/projects/${projectId}/files`, owner.cookie);
    assert.equal(filesResponse.status, 200);
    const files = (await filesResponse.json() as { files: Array<{ id: string; path: string; revision: number }> }).files;
    const entry = files.find(file => file.path === 'src/index.js');
    assert.ok(entry);
    assert.equal((await request(`/api/build/projects/${projectId}/files/${entry.id}`, outsider.cookie)).status, 404);
    assert.equal((await request(`/api/build/projects/${projectId}/files`, owner.cookie, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '../escape.js', content: 'nope' }),
    })).status, 400);
    assert.equal((await request(`/api/build/projects/${projectId}/files`, owner.cookie, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'src/scan.js', content: 'eval(input);\n' }),
    })).status, 201);

    const savedResponse = await request(`/api/build/projects/${projectId}/files/${entry.id}`, owner.cookie, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: "const api_key = 'not-a-real-secret-value';\n", revision: 0 }),
    });
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json() as { file: { revision: number } };
    assert.equal(saved.file.revision, 1);
    const versions = await request(`/api/build/projects/${projectId}/files/${entry.id}/versions`, owner.cookie);
    assert.equal((await versions.json() as { versions: unknown[] }).versions.length, 1);

    const proposal = await post(`/api/build/projects/${projectId}/approvals`, {
      fileId: entry.id, baseRevision: 1, summary: 'Replace the sample file safely.', content: "console.log('approved change');\n",
    }, owner.cookie);
    assert.equal(proposal.status, 201);
    const approvalId = (await proposal.json() as { approval: { id: string } }).approval.id;
    assert.equal((await request(`/api/build/projects/${projectId}/approvals/${approvalId}`, outsider.cookie, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }),
    })).status, 404);
    const approved = await request(`/api/build/projects/${projectId}/approvals/${approvalId}`, owner.cookie, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }),
    });
    assert.equal(approved.status, 200);
    const updatedFile = await request(`/api/build/projects/${projectId}/files/${entry.id}`, owner.cookie);
    assert.equal((await updatedFile.json() as { file: { content: string } }).file.content, "console.log('approved change');\n");

    const scan = await request(`/api/build/projects/${projectId}/scan`, owner.cookie, { method: 'POST' });
    assert.equal(scan.status, 201);
    const scanResult = await scan.json() as { scan: { findings: Array<{ rule: string; status: string }> } };
    assert.ok(scanResult.scan.findings.some(finding => finding.rule === 'dynamic-code-execution' && finding.status === 'needs_review'));
    assert.equal((await request(`/api/build/projects/${projectId}/scan`, outsider.cookie, { method: 'POST' })).status, 404);

    const archiveResponse = await request(`/api/build/projects/${projectId}`, owner.cookie, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'archived' }),
    });
    assert.equal(archiveResponse.status, 200);
    const blockedWrite = await request(`/api/build/projects/${projectId}/files`, owner.cookie, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'later.js', content: '' }),
    });
    assert.equal(blockedWrite.status, 404);
    const deleted = await request(`/api/build/projects/${projectId}`, owner.cookie, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    projectId = '';
  } finally {
    const ownerIds = owners.map(id => new mongoose.Types.ObjectId(id));
    if (owners.length) {
      const filter = { ownerId: { $in: ownerIds } };
      const [files, versions, approvals] = await Promise.all([
        BuildProjectFile.find(filter).select('fileId').lean(),
        BuildProjectFileVersion.find(filter).select('fileId').lean(),
        BuildApproval.find(filter).select('proposalFileId').lean(),
      ]);
      const ids = new Map([...files, ...versions].map(item => [item.fileId.toString(), item.fileId]));
      for (const approval of approvals) ids.set(approval.proposalFileId.toString(), approval.proposalFileId);
      const bucket = mongoose.connection.db ? new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'build_project_files' }) : null;
      if (bucket) await Promise.all([...ids.values()].map(id => bucket.delete(id).catch(() => undefined)));
      await Promise.all([
        BuildProject.deleteMany(filter), BuildProjectFile.deleteMany(filter), BuildProjectFileVersion.deleteMany(filter),
        BuildApproval.deleteMany(filter), BuildSecurityScan.deleteMany(filter), Session.deleteMany({ userId: { $in: ownerIds } }),
        Permission.deleteMany({ userId: { $in: ownerIds } }), Profile.deleteMany({ userId: { $in: ownerIds } }),
        User.deleteMany({ _id: { $in: ownerIds } }),
      ]);
    }
    if (projectId) await BuildProject.deleteOne({ _id: projectId });
    await mongoose.disconnect();
  }
});
