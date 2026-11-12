import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILD_TEMPLATES, getBuildTemplateFiles, safeBuildPath, scanBuildFiles } from '../src/lib/build';
import { BuildArchiveError, readBuildZip, writeBuildZip } from '../src/lib/build-archive';
import { BuildExecutionUnavailableError, clipBuildOutput, createUnavailableBuildExecutionProvider } from '../src/lib/server/build-execution-provider';
import { BUILD_DOCKER_RESOURCE_POLICY, detectBuildRuntime, isValidBuildBranch, MAX_BUILD_COMMAND_TIMEOUT_MS, parseBuildCommand } from '../src/lib/build-execution-policy';
import { BuildGitHubUnavailableError, createUnavailableBuildGitHubProvider } from '../src/lib/server/build-github-provider';
import { detectBuildPreviewTarget, isSafeBuildPreviewUrl, parseBuildRuntimeDiagnostic } from '../src/lib/build-preview';
import { BuildPreviewUnavailableError, createUnavailableBuildPreviewProvider } from '../src/lib/server/build-preview-provider';

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
  assert.equal(await provider.checkAvailability(), false);
  await assert.rejects(provider.run('test', ['npm', 'test'], 1000, new AbortController().signal), BuildExecutionUnavailableError);
  await assert.rejects(provider.exportWorkspace('test'), BuildExecutionUnavailableError);
});

test('BUILD command policy permits only bounded offline commands without shell expansion', () => {
  assert.deepEqual(parseBuildCommand('npm run build'), {
    args: ['npm', 'run', 'build'], requiresApproval: true, needsNetwork: false,
  });
  assert.deepEqual(parseBuildCommand('python -m pytest'), {
    args: ['python3', '-m', 'pytest'], requiresApproval: true, needsNetwork: false,
  });
  assert.deepEqual(parseBuildCommand('npm install'), {
    args: ['npm', 'install', '--offline', '--no-audit', '--no-fund'], requiresApproval: true, needsNetwork: false,
  });
  assert.deepEqual(parseBuildCommand('pip install --no-index sample==1.2'), {
    args: ['python3', '-m', 'pip', 'install', '--no-index', 'sample==1.2'], requiresApproval: true, needsNetwork: false,
  });
  for (const command of [
    'npm run build; curl attacker.test',
    'python -c print(1)',
    'curl https://example.test',
    'rm -rf /workspace',
    'pip install package',
    'npm run unknown',
    'python ../outside.py',
  ]) assert.equal(parseBuildCommand(command), null, command);
});

test('BUILD runtime and Git branch detection reject unsafe values', () => {
  assert.equal(detectBuildRuntime(['requirements.txt', 'main.py']), 'python');
  assert.equal(detectBuildRuntime(['src/App.java']), 'java');
  assert.equal(detectBuildRuntime(['src/main.c']), 'native');
  assert.equal(detectBuildRuntime(['package.json']), 'node');
  assert.equal(isValidBuildBranch('feature/editor-sync'), true);
  for (const branch of ['--force', '../main', 'main..work', 'main.lock', 'branch/', '']) {
    assert.equal(isValidBuildBranch(branch), false, branch);
  }
});

test('BUILD Docker resource and output policies are bounded', () => {
  assert.equal(BUILD_DOCKER_RESOURCE_POLICY.memory, '1g');
  assert.equal(BUILD_DOCKER_RESOURCE_POLICY.cpus, '1');
  assert.equal(BUILD_DOCKER_RESOURCE_POLICY.pids, 128);
  assert.equal(BUILD_DOCKER_RESOURCE_POLICY.workspaceTmpfsMb, 512);
  assert.equal(MAX_BUILD_COMMAND_TIMEOUT_MS, 600000);
  const clipped = clipBuildOutput('x'.repeat(100_000));
  assert.ok(Buffer.byteLength(clipped) <= 64 * 1024);
  assert.ok(clipped.endsWith('[output truncated]'));
});

test('BUILD GitHub adapter fails explicitly until server-side credentials are configured', async () => {
  const provider = createUnavailableBuildGitHubProvider();
  assert.equal(provider.isConfigured(), false);
  await assert.rejects(provider.listRepositories(), BuildGitHubUnavailableError);
  await assert.rejects(provider.push('project', 'main', true), BuildGitHubUnavailableError);
});

test('BUILD preview detection uses project manifests and only reports known framework start scripts', () => {
  assert.deepEqual(detectBuildPreviewTarget([
    { path: 'package.json', content: JSON.stringify({ scripts: { dev: 'next dev' }, dependencies: { next: '16', react: '19' } }) },
  ]), {
    framework: 'nextjs', runtime: 'node', command: 'npm run dev', status: 'detected',
    explanation: 'Next.js dependency and an application start script were detected.',
  });
  assert.equal(detectBuildPreviewTarget([
    { path: 'package.json', content: JSON.stringify({ scripts: { dev: 'vite --host' }, devDependencies: { vite: '6' } }) },
  ]).framework, 'vite');
  assert.equal(detectBuildPreviewTarget([{ path: 'index.html', content: '<main>App</main>' }]).runtime, 'static');
  assert.equal(detectBuildPreviewTarget([
    { path: 'package.json', content: JSON.stringify({ dependencies: { next: '16' } }) },
  ]).status, 'unsupported');
  assert.equal(detectBuildPreviewTarget([
    { path: 'package.json', content: '{broken' },
  ]).status, 'unsupported');
});

test('BUILD preview gateway URL policy blocks non-HTTPS, private, mismatched and credentialed URLs', () => {
  const origin = 'https://preview.example.com';
  assert.equal(isSafeBuildPreviewUrl('https://preview.example.com/p/abc/index.html', origin), true);
  for (const url of [
    'http://preview.example.com/p/abc',
    'https://evil.example.com/p/abc',
    'https://127.0.0.1/p/abc',
    'https://10.0.0.2/p/abc',
    'https://169.254.169.254/latest/meta-data',
    'https://100.100.100.200/p/abc',
    'https://[::1]/p/abc',
    'https://host/p/abc',
    'https://metadata.google.internal/',
    'https://user:pass@preview.example.com/p/abc',
    'https://preview.example.com/p/abc?token=secret',
  ]) assert.equal(isSafeBuildPreviewUrl(url, origin), false, url);
});

test('BUILD diagnostics come from failed command evidence and retain parsed source location', () => {
  const diagnostic = parseBuildRuntimeDiagnostic({
    id: 'log-id', sessionId: 'session-id', command: 'npm run build',
    stdout: '', stderr: 'src/page.tsx(12,4): error TS2322: Type mismatch\nmore details',
    exitCode: 2, createdAt: new Date('2026-01-02T03:04:05.000Z'),
  });
  assert.equal(diagnostic?.source, 'build');
  assert.equal(diagnostic?.filePath, 'src/page.tsx');
  assert.equal(diagnostic?.line, 12);
  assert.equal(diagnostic?.column, 4);
  assert.match(diagnostic?.stackTrace ?? '', /Type mismatch/);
  assert.equal(parseBuildRuntimeDiagnostic({
    id: 'ok', sessionId: 'session', command: 'npm run build', stdout: 'done',
    stderr: '', exitCode: 0, createdAt: new Date(),
  }), null);
});

test('BUILD preview provider fails closed without a separately secured gateway', async () => {
  const provider = createUnavailableBuildPreviewProvider();
  assert.equal(provider.isConfigured(), false);
  assert.equal(await provider.checkAvailability(), false);
  await assert.rejects(provider.start({
    previewId: 'preview', executionSessionId: 'execution', runtime: 'node',
    framework: 'vite', command: 'npm run dev',
  }), BuildPreviewUnavailableError);
  await assert.rejects(provider.restart('preview', {
    previewId: 'preview', executionSessionId: 'execution', runtime: 'node',
    framework: 'vite', command: 'npm run dev',
  }), BuildPreviewUnavailableError);
  await assert.rejects(provider.stop('preview'), BuildPreviewUnavailableError);
  await assert.rejects(provider.reload('preview'), BuildPreviewUnavailableError);
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
