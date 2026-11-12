import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CREATE_CATEGORIES,
  CREATE_PROJECT_TEMPLATES,
  createInitialData,
  hasSupportedCreateFileSignature,
  projectTypeForCategory,
  safeCreateFilename,
} from '../src/lib/create';
import { createUnavailableMediaProvider, CreateProviderUnavailableError } from '../src/lib/server/create-media-provider';

test('CREATE exposes every requested category and selects the matching editor type', () => {
  assert.deepEqual(CREATE_CATEGORIES, ['image', 'video', 'graphic-design', 'document', 'presentation', 'social-media', 'marketing', 'audio', 'custom']);
  assert.equal(projectTypeForCategory('graphic-design'), 'design');
  assert.equal(projectTypeForCategory('social-media'), 'design');
  assert.equal(projectTypeForCategory('image'), 'image');
  assert.equal(projectTypeForCategory('video'), 'video');
  assert.equal(projectTypeForCategory('document'), 'document');
  assert.equal(projectTypeForCategory('presentation'), 'presentation');
  assert.equal(projectTypeForCategory('audio'), 'audio');
  assert.equal(CREATE_PROJECT_TEMPLATES.length, 10);
});

test('new projects receive functional, type-specific local editing documents', () => {
  assert.deepEqual(createInitialData('design', 1280, 720), { width: 1280, height: 720, background: '#ffffff', elements: [] });
  assert.equal((createInitialData('presentation').slides as Array<{ id: string }>)[0].id, 'slide-1');
  assert.equal(createInitialData('image').brightness, 100);
  assert.equal(createInitialData('video').trimStart, 0);
  assert.equal(createInitialData('document').text, '');
});

test('upload MIME validation rejects mismatched signatures and accepts supported formats', () => {
  assert.equal(hasSupportedCreateFileSignature('image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0])), true);
  assert.equal(hasSupportedCreateFileSignature('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0, 0])), true);
  assert.equal(hasSupportedCreateFileSignature('video/webm', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])), true);
  assert.equal(hasSupportedCreateFileSignature('application/pdf', new TextEncoder().encode('%PDF-1.7')), true);
  assert.equal(hasSupportedCreateFileSignature('text/plain', new TextEncoder().encode('A private note')), true);
  assert.equal(hasSupportedCreateFileSignature('image/png', new TextEncoder().encode('<script>alert(1)</script>')), false);
  assert.equal(hasSupportedCreateFileSignature('text/plain', new Uint8Array([0x61, 0, 0x62, 0x63])), false);
  assert.equal(hasSupportedCreateFileSignature('image/svg+xml', new TextEncoder().encode('<svg>')), false);
});

test('asset filenames remove path controls before storage or response headers', () => {
  assert.equal(safeCreateFilename('../../private\\image.png'), '.._.._private_image.png');
  assert.equal(safeCreateFilename('   '), 'creative-asset');
  assert.equal(safeCreateFilename('line\nbreak.txt'), 'line_break.txt');
});

test('unconfigured media providers fail explicitly instead of returning pretend output', async () => {
  const provider = createUnavailableMediaProvider('image');
  assert.equal(provider.isConfigured(), false);
  await assert.rejects(
    provider.generate('image', { prompt: 'A poster' }, new AbortController().signal),
    CreateProviderUnavailableError,
  );
});
