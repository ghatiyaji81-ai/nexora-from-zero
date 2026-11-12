import { safeBuildPath } from '@/lib/build';
import type { BuildRuntime } from '@/lib/server/build-execution-provider';

export type BuildTestFramework = 'vitest' | 'jest' | 'playwright' | 'cypress' | 'node-test' | 'pytest' | 'unittest' | 'maven' | 'gradle' | 'unknown';
export type BuildTestFile = { path: string; size: number };
export type BuildTestTarget = {
  runtime: BuildRuntime;
  framework: BuildTestFramework;
  declared: boolean;
  scriptName: string | null;
  configs: string[];
  testFiles: BuildTestFile[];
  command: string[] | null;
  unavailableReason: string | null;
  requirements: string[];
};

type ProjectFile = { path: string; content?: string; size?: number };
type PackageManifest = {
  packageManager?: unknown;
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};

const TEST_FILE = /(^|\/)(test|tests|__tests__)(\/|$)|(^|\/)[^/]+\.(test|spec|cy)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|(^|\/)[^/]+_test\.py$/i;
const PACKAGE_LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
const FRAMEWORKS: BuildTestFramework[] = ['vitest', 'jest', 'playwright', 'cypress'];

function parsedPackage(files: ProjectFile[]): PackageManifest | null {
  const file = files.find(item => item.path.toLowerCase() === 'package.json');
  if (!file?.content) return null;
  try {
    const parsed: unknown = JSON.parse(file.content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as PackageManifest : null;
  } catch {
    return null;
  }
}

function dependencySet(manifest: PackageManifest | null) {
  return new Set(Object.keys({ ...manifest?.dependencies, ...manifest?.devDependencies }).map(name => name.toLowerCase()));
}

function scriptNameFor(manifest: PackageManifest | null) {
  const scripts = manifest?.scripts ?? {};
  return ['test', 'test:unit', 'test:e2e'].find(name => typeof scripts[name] === 'string') ?? null;
}

export function detectBuildTestTarget(files: ProjectFile[]): BuildTestTarget {
  const paths = new Set(files.map(file => file.path.toLowerCase()));
  const manifest = parsedPackage(files);
  const dependencies = dependencySet(manifest);
  const scriptName = scriptNameFor(manifest);
  const configs = files.filter(file => /(^|\/)(vitest|jest|playwright|cypress|pytest|tox|karma|mocha)\.config\.[^/]+$/i.test(file.path) ||
    /(^|\/)pytest\.ini$|(^|\/)tox\.ini$|(^|\/)pom\.xml$|(^|\/)build\.gradle(?:\.kts)?$|(^|\/)settings\.gradle(?:\.kts)?$/i.test(file.path))
    .map(file => file.path).slice(0, 30);
  const testFiles = files.filter(file => TEST_FILE.test(file.path) && safeBuildPath(file.path))
    .map(file => ({ path: file.path, size: file.size ?? 0 })).slice(0, 200);
  const base = { runtime: 'node' as BuildRuntime, framework: 'unknown' as BuildTestFramework, declared: false, scriptName, configs, testFiles, command: null as string[] | null, unavailableReason: 'No supported test framework or test script was detected.', requirements: [] as string[] };

  const configFramework = configs.map(file => {
    const name = file.split('/').pop()?.toLowerCase() ?? '';
    return name.startsWith('vitest.') ? 'vitest' as const
      : name.startsWith('jest.') ? 'jest' as const
        : name.startsWith('playwright.') ? 'playwright' as const
          : name.startsWith('cypress.') ? 'cypress' as const : null;
  }).find(Boolean);
  if (configFramework && !dependencies.has(configFramework) &&
    !(configFramework === 'playwright' && dependencies.has('@playwright/test'))) {
    return { ...base, framework: configFramework, unavailableReason: `A ${configFramework} configuration exists, but its package dependency is not declared. No test command will run.` };
  }

  for (const framework of FRAMEWORKS) {
    const declared = dependencies.has(framework) || (framework === 'playwright' && dependencies.has('@playwright/test'));
    if (!declared && !(framework === 'playwright' && paths.has('playwright.config.ts'))) continue;
    if (!scriptName) return { ...base, framework, declared, unavailableReason: 'A test framework is declared but there is no supported test script in package.json.' };
    const commandByFramework: Partial<Record<BuildTestFramework, string[]>> = {
      vitest: ['npm', 'run', scriptName, '--', '--run'],
      jest: ['npm', 'run', scriptName, '--', '--runInBand'],
      playwright: ['npm', 'run', scriptName, '--', '--workers=1'],
      cypress: ['npm', 'run', scriptName, '--', '--browser', 'electron'],
    };
    const command = commandByFramework[framework];
    if (!command) continue;
    return {
      ...base, runtime: 'node', framework, declared, command,
      unavailableReason: declared ? null : 'Configuration was found, but the test framework dependency is not declared.',
      requirements: ['An active isolated Node execution session', 'Project test dependencies available in its local node_modules'],
    };
  }

  if (scriptName && typeof manifest?.scripts?.[scriptName] === 'string' &&
    /^\s*node(?:\.exe)?\s+--test(?:\s|$)/i.test(manifest.scripts[scriptName] as string)) {
    return {
      ...base, framework: 'node-test', declared: true, command: ['node', '--test'],
      unavailableReason: null, requirements: ['An active isolated Node execution session'],
    };
  }
  if (files.some(file => /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file.path)) && dependencies.has('node')) {
    return { ...base, framework: 'node-test', declared: true, command: ['node', '--test'], unavailableReason: null, requirements: ['An active isolated Node execution session'] };
  }

  if (paths.has('pom.xml')) return {
    ...base, runtime: 'java', framework: 'maven', declared: true, scriptName: null, command: ['mvn', '--offline', 'test'],
    unavailableReason: null, requirements: ['An active isolated Java session with Maven and cached dependencies'],
  };
  if ([...paths].some(path => /^build\.gradle(?:\.kts)?$/.test(path) || /^settings\.gradle(?:\.kts)?$/.test(path))) return {
    ...base, runtime: 'java', framework: 'gradle', declared: true, scriptName: null, command: ['gradle', '--offline', 'test'],
    unavailableReason: null, requirements: ['An active isolated Java session with Gradle and cached dependencies'],
  };
  const pythonConfig = files.find(file => ['requirements.txt', 'pyproject.toml', 'pipfile', 'setup.cfg'].includes(file.path.toLowerCase()));
  const pythonText = `${pythonConfig?.path ?? ''}\n${pythonConfig?.content ?? ''}`.toLowerCase();
  if (pythonConfig && /\bpytest\b/.test(pythonText)) return {
    ...base, runtime: 'python', framework: 'pytest', declared: true, scriptName: null, command: ['python3', '-m', 'pytest', '-q'],
    unavailableReason: null, requirements: ['An active isolated Python session with pytest available offline'],
  };
  if (files.some(file => /\.py$/i.test(file.path)) && testFiles.length) return {
    ...base, runtime: 'python', framework: 'unittest', declared: true, scriptName: null, command: ['python3', '-m', 'unittest', 'discover'],
    unavailableReason: null, requirements: ['An active isolated Python session'],
  };
  if (files.some(file => /\.(?:c|cc|cpp|h|hpp)$/i.test(file.path))) {
    return { ...base, runtime: 'native', unavailableReason: 'BUILD does not currently have a verified C/C++ test runner adapter.' };
  }
  return base;
}

export function buildTestCommand(target: BuildTestTarget, selectedPath?: string) {
  if (!target.command || target.unavailableReason) return null;
  if (selectedPath === undefined) return target.command;
  const safePath = safeBuildPath(selectedPath);
  if (!safePath || !target.testFiles.some(file => file.path.toLowerCase() === safePath.toLowerCase())) return null;
  switch (target.framework) {
    case 'vitest': return ['npm', 'run', target.scriptName!, '--', '--run', safePath];
    case 'jest': return ['npm', 'run', target.scriptName!, '--', '--runInBand', '--runTestsByPath', safePath];
    case 'playwright': return ['npm', 'run', target.scriptName!, '--', '--workers=1', safePath];
    case 'cypress': return ['npm', 'run', target.scriptName!, '--', '--browser', 'electron', '--spec', safePath];
    case 'pytest': return ['python3', '-m', 'pytest', '-q', safePath];
    case 'unittest': return ['python3', '-m', 'unittest', safePath.replace(/\.py$/i, '').replace(/[\\/]/g, '.')];
    case 'node-test': return ['node', '--test', safePath];
    case 'maven': {
      const className = safePath.split('/').pop()?.replace(/\.java$/i, '');
      return className && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(className)
        ? ['mvn', '--offline', `-Dtest=${className}`, 'test'] : null;
    }
    case 'gradle': {
      const className = safePath.split('/').pop()?.replace(/\.java$/i, '');
      return className && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(className)
        ? ['gradle', '--offline', 'test', '--tests', className] : null;
    }
    default: return null;
  }
}

export type ParsedTestFailure = { name: string; message: string };
export type ParsedTestCounts = { total: number | null; passed: number | null; failed: number | null; skipped: number | null; failures: ParsedTestFailure[] };

export function parseBuildTestOutput(framework: BuildTestFramework, output: string): ParsedTestCounts {
  const text = output.slice(0, 64 * 1024);
  let total: number | null = null;
  let passed: number | null = null;
  let failed: number | null = null;
  let skipped: number | null = null;
  if (framework === 'vitest' || framework === 'jest') {
    const match = text.match(/Tests:\s*(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed)?(?:,\s*(\d+)\s+skipped)?(?:,\s*(\d+)\s+total)?/i);
    if (match) {
      failed = match[1] ? Number(match[1]) : 0;
      passed = match[2] ? Number(match[2]) : null;
      skipped = match[3] ? Number(match[3]) : 0;
      total = match[4] ? Number(match[4]) : [failed, passed, skipped].every(value => value !== null) ? failed + (passed ?? 0) + (skipped ?? 0) : null;
    } else {
      const vitest = text.match(/Tests\s+(\d+)\s+(?:failed|passed|skipped)\s+\((\d+)\)/i);
      if (vitest) {
        const n = Number(vitest[1]);
        const kind = vitest[0].toLowerCase();
        failed = kind.includes('failed') ? n : 0;
        passed = kind.includes('passed') ? n : 0;
        skipped = kind.includes('skipped') ? n : 0;
        total = Number(vitest[2]);
      }
    }
    if (framework === 'vitest' && total === null) {
      const summary = text.match(/Tests\s+((?:(?:\d+)\s+(?:failed|passed|skipped)(?:\s*\|\s*)?)+)\s*\((\d+)\)/i);
      if (summary) {
        const segment = summary[1];
        failed = Number(segment.match(/(\d+)\s+failed/i)?.[1] ?? 0);
        passed = Number(segment.match(/(\d+)\s+passed/i)?.[1] ?? 0);
        skipped = Number(segment.match(/(\d+)\s+skipped/i)?.[1] ?? 0);
        total = Number(summary[2]);
      }
    }
  } else if (framework === 'pytest') {
    const match = text.match(/(?:=+)\s*(?:(\d+)\s+failed)?(?:,\s*)?(?:(\d+)\s+passed)?(?:,\s*)?(?:(\d+)\s+skipped)?(?:,\s*\d+\s+(?:error|errors))?.*in\s+[\d.]+s\s*(?:=+)?/i);
    if (match) {
      failed = match[1] ? Number(match[1]) : 0;
      passed = match[2] ? Number(match[2]) : 0;
      skipped = match[3] ? Number(match[3]) : 0;
      total = failed + passed + skipped;
    }
  } else if (framework === 'maven') {
    const match = text.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/i);
    if (match) {
      total = Number(match[1]); failed = Number(match[2]) + Number(match[3]);
      skipped = Number(match[4]); passed = total - failed - skipped;
    }
  } else if (framework === 'node-test') {
    const match = text.match(/ℹ tests\s+(\d+)[\s\S]*?ℹ pass\s+(\d+)[\s\S]*?ℹ fail\s+(\d+)[\s\S]*?ℹ cancelled\s+(\d+)[\s\S]*?ℹ skipped\s+(\d+)/);
    if (match) {
      total = Number(match[1]); passed = Number(match[2]); failed = Number(match[3]); skipped = Number(match[5]);
    }
  } else if (framework === 'playwright') {
    const summary = text.match(/(?:^|\n)\s*(?:(\d+)\s+failed)?(?:\s*\|\s*)?(?:(\d+)\s+passed)?(?:\s*\|\s*)?(?:(\d+)\s+skipped)?\s*\([\d.]+s\)/i);
    if (summary && (summary[1] || summary[2] || summary[3])) {
      failed = Number(summary[1] ?? 0); passed = Number(summary[2] ?? 0); skipped = Number(summary[3] ?? 0);
      total = failed + passed + skipped;
    }
  } else if (framework === 'cypress') {
    const passing = text.match(/(?:^|\n)\s*(\d+)\s+passing\b/i);
    const failing = text.match(/(?:^|\n)\s*(\d+)\s+failing\b/i);
    const pending = text.match(/(?:^|\n)\s*(\d+)\s+pending\b/i);
    if (passing || failing || pending) {
      passed = Number(passing?.[1] ?? 0); failed = Number(failing?.[1] ?? 0); skipped = Number(pending?.[1] ?? 0);
      total = passed + failed + skipped;
    }
  }
  const failures = text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(?:FAIL|FAILED|✘|✕|×)\s+(.+?)(?:\s+-\s+(.*))?$/);
    return match ? [{ name: match[1].slice(0, 500), message: (match[2] ?? '').slice(0, 1000) }] : [];
  }).slice(0, 50);
  return { total, passed, failed, skipped, failures };
}

export function detectBuildPackageManager(files: ProjectFile[]) {
  const paths = new Set(files.map(file => file.path.toLowerCase()));
  if (paths.has('pnpm-lock.yaml')) return { manager: 'pnpm', lockfile: 'pnpm-lock.yaml' };
  if (paths.has('yarn.lock')) return { manager: 'yarn', lockfile: 'yarn.lock' };
  if (paths.has('bun.lock') || paths.has('bun.lockb')) return { manager: 'bun', lockfile: paths.has('bun.lock') ? 'bun.lock' : 'bun.lockb' };
  if (paths.has('package-lock.json')) return { manager: 'npm', lockfile: 'package-lock.json' };
  if (paths.has('npm-shrinkwrap.json')) return { manager: 'npm', lockfile: 'npm-shrinkwrap.json' };
  if (paths.has('uv.lock')) return { manager: 'uv', lockfile: 'uv.lock' };
  if (paths.has('poetry.lock')) return { manager: 'poetry', lockfile: 'poetry.lock' };
  if (paths.has('pyproject.toml')) {
    const file = files.find(item => item.path.toLowerCase() === 'pyproject.toml');
    const body = file?.content?.toLowerCase() ?? '';
    const manager = body.includes('[tool.poetry]') ? 'poetry' : body.includes('[tool.uv]') ? 'uv' : 'pip';
    return { manager, lockfile: paths.has('uv.lock') ? 'uv.lock' : paths.has('poetry.lock') ? 'poetry.lock' : null };
  }
  if (paths.has('requirements.txt') || paths.has('pipfile')) return { manager: paths.has('pipfile') ? 'pipenv' : 'pip', lockfile: paths.has('pipfile.lock') ? 'Pipfile.lock' : null };
  if (paths.has('pom.xml')) return { manager: 'maven', lockfile: null };
  if (paths.has('build.gradle') || paths.has('build.gradle.kts') || paths.has('settings.gradle') || paths.has('settings.gradle.kts')) return { manager: 'gradle', lockfile: null };
  const packageManager = parsedPackage(files)?.packageManager;
  if (typeof packageManager === 'string') {
    const manager = packageManager.split('@')[0];
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return { manager, lockfile: null };
  }
  return { manager: null, lockfile: null };
}

export function inspectBuildDependencies(files: ProjectFile[]) {
  const manifest = parsedPackage(files);
  const deps = Object.entries(manifest?.dependencies ?? {}).map(([name, version]) => ({ name, version: String(version), kind: 'production' }));
  const devDeps = Object.entries(manifest?.devDependencies ?? {}).map(([name, version]) => ({ name, version: String(version), kind: 'development' }));
  const paths = new Set(files.map(file => file.path.toLowerCase()));
  const manager = detectBuildPackageManager(files);
  const python = files.find(file => ['requirements.txt', 'pyproject.toml'].includes(file.path.toLowerCase()));
  if (python?.path.toLowerCase() === 'requirements.txt') {
    for (const line of (python.content ?? '').split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z0-9][A-Za-z0-9._-]{0,79})(?:\s*([=<>~!]+)\s*([A-Za-z0-9.*+!-]+))?/);
      if (match) deps.push({ name: match[1], version: match[2] ? `${match[2]}${match[3]}` : 'unconstrained', kind: 'python' });
    }
  }
  for (const file of files.filter(item => /(^|\/)pom\.xml$/.test(item.path.toLowerCase()))) {
    const xml = file.content ?? '';
    const regex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>(?:\s*<version>([^<]+)<\/version>)?/g;
    for (const match of xml.matchAll(regex)) deps.push({ name: `${match[1]}:${match[2]}`, version: match[3] ?? 'managed', kind: 'java' });
  }
  for (const file of files.filter(item => /(^|\/)build\.gradle(?:\.kts)?$/.test(item.path.toLowerCase()))) {
    for (const match of (file.content ?? '').matchAll(/(?:implementation|api|testImplementation|testRuntimeOnly)\s*\(?\s*["']([^:"']+):([^:"']+):([^"']+)["']/g)) {
      deps.push({ name: `${match[1]}:${match[2]}`, version: match[3], kind: 'java' });
    }
  }
  return {
    packageManager: manager.manager,
    lockfile: manager.lockfile,
    lockfilePresent: Boolean(manager.lockfile && paths.has(manager.lockfile.toLowerCase())),
    manifestPresent: Boolean(manifest || python || paths.has('pom.xml') || paths.has('build.gradle') || paths.has('build.gradle.kts')),
    dependencies: [...deps, ...devDeps].slice(0, 500),
    devDependencies: devDeps.slice(0, 300),
    installed: 'unknown' as const,
    registry: { available: false, reason: 'Registry inspection is unavailable: no approved network broker is configured, and project sandboxes have network disabled.' },
    operations: { available: false, reason: 'Dependency changes and installation are unavailable until a secure package broker and reviewed manifest/lockfile workflow are configured.' },
    vulnerabilities: { available: false, reason: 'No trusted vulnerability provider is configured; no vulnerability assessment was performed.' },
  };
}
