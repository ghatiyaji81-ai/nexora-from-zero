import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILD_TEMPLATES, getBuildTemplateFiles, safeBuildPath, scanBuildFiles } from '../src/lib/build';
import { BuildArchiveError, readBuildZip, writeBuildZip } from '../src/lib/build-archive';
import { BuildExecutionUnavailableError, createUnavailableBuildExecutionProvider } from '../src/lib/server/build-execution-provider';

test('BUILD starters initialize actual files and avoid exposing execution claims', () => {
  assert.equal(BUILD_TEMPLATES.length, 15);
  assert.deepEqual(getBuildTemplateFiles('html', 'Sample').map(file => file.path), ['README.md', 'index.html', 'styles.css', 'main.js']);
  assert.ok(getBuildTemplateFiles('python', 'Sample').some(file => file.path === 'main.py'));
  assert.ok(getBuildTemplateFiles('nextjs', 'Sample').some(file => file.path === 'app/page.tsx'));
});

test('BUILD file paths reject traversal, absolute paths and platform-specific special names', () => {
  assert.equal(safeBuildPath('src/main.ts'), 'src/main.ts');
  for (const path of ['../secret', 'src/../secret', '/absolute/file', 'C:/secret', 'src\\file.ts', 'src//file.ts', 'NUL.txt', 'src/']) {
    assert.equal(safeBuildPath(path), null, path);
  }
});

test('BUILD scanner returns evidence-based heuristic findings with exact source lines', () => {
  const findings = scanBuildFiles([
    { path: 'src/app.ts', content: "const api_key = 'not-a-real-secret-value';\nconst result = eval(input);\n" },
    { path: 'src/page.tsx', content: '<div dangerouslySetInnerHTML={{ __html: input }} />\n' },
  ]);
  assert.equal(findings.length, 3);
  assert.deepEqual(findings.map(finding => [finding.rule, finding.path, finding.line]), [
    ['possible-hardcoded-secret', 'src/app.ts', 1],
    ['dynamic-code-execution', 'src/app.ts', 2],
    ['unsafe-html-rendering', 'src/page.tsx', 1],
  ]);
  assert.ok(findings.every(finding => finding.status === 'needs_review'));
});

test('BUILD execution fails closed when no isolated provider is installed', async () => {
  const provider = createUnavailableBuildExecutionProvider();
  assert.equal(provider.isConfigured(), false);
  await assert.rejects(provider.run('test', '0'.repeat(24), new AbortController().signal), BuildExecutionUnavailableError);
});

test('BUILD ZIP export and import preserve multiple safe UTF-8 source files', () => {
  const files = [
    { path: 'src/index.ts', content: 'export const greeting = "Hello";\n' },
    { path: 'README.md', content: '# Example\n\nUnicode: café.\n' },
    { path: 'empty.txt', content: '' },
  ];
  assert.deepEqual(readBuildZip(writeBuildZip(files)), files);
});

test('BUILD ZIP import rejects traversal paths and corrupt entry contents', () => {
  const traversal = writeBuildZip([{ path: 'src/a', content: 'safe' }]);
  const localNameLength = traversal.readUInt16LE(26);
  traversal.write('../aa', 30, 'ascii');
  const central = traversal.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(central > 0);
  traversal.write('../aa', central + 46, 'ascii');
  assert.equal(localNameLength, 5);
  assert.throws(() => readBuildZip(traversal), BuildArchiveError);

  const corrupted = writeBuildZip([{ path: 'src/main.js', content: 'const value = 123;\n' }]);
  const payloadOffset = 30 + corrupted.readUInt16LE(26) + corrupted.readUInt16LE(28);
  corrupted[payloadOffset] ^= 0xff;
  assert.throws(() => readBuildZip(corrupted), /integrity check/);
});

test('BUILD ZIP import rejects malformed archives and binary payloads', () => {
  assert.throws(() => readBuildZip(Buffer.from('not a zip')), /valid ZIP archive/);
  assert.throws(() => readBuildZip(writeBuildZip([{ path: 'image.png', content: 'a\0b' }])), /Binary files are not supported/);
});
