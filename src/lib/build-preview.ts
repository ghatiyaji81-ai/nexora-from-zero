import { isIP } from 'node:net';

export type BuildPreviewFramework = 'nextjs' | 'vite' | 'react' | 'node' | 'static' | 'unsupported';
export type BuildPreviewProjectFile = { path: string; content?: string };
type BuildManifest = {
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};
export type BuildPreviewTarget = {
  framework: BuildPreviewFramework;
  runtime: 'node' | 'static' | 'unsupported';
  command: string | null;
  status: 'detected' | 'unsupported';
  explanation: string;
};

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.onion')) return true;
  if (!isIP(host)) return false;
  if (host.includes(':')) {
    const normalized = host.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
      normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('::ffff:') ||
      normalized.startsWith('2001:db8:');
  }
  const octets = host.split('.').map(Number);
  return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && (octets[1] === 0 || octets[1] === 168)) ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19 || octets[1] === 51)) ||
    (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) ||
    octets[0] >= 224;
}

export function isSafeBuildPreviewUrl(value: string, expectedOrigin: string) {
  try {
    const url = new URL(value);
    const expected = new URL(expectedOrigin);
    return expected.protocol === 'https:' && !isPrivateHostname(expected.hostname) && !expected.username && !expected.password &&
      !expected.search && !expected.hash && expected.port === '' &&
      url.protocol === 'https:' && !isPrivateHostname(url.hostname) &&
      url.origin === expected.origin && !url.username && !url.password &&
      !url.search && !url.hash && url.port === '';
  } catch {
    return false;
  }
}

export function detectBuildPreviewTarget(files: BuildPreviewProjectFile[]): BuildPreviewTarget {
  const paths = new Set(files.map(file => file.path.toLowerCase()));
  const packageFile = files.find(file => file.path.toLowerCase() === 'package.json');
  let manifest: BuildManifest | null = null;
  if (packageFile?.content) {
    try {
      const parsed = JSON.parse(packageFile.content) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        manifest = parsed as BuildManifest;
      }
    } catch {
      return { framework: 'unsupported', runtime: 'unsupported', command: null, status: 'unsupported', explanation: 'package.json is not valid JSON, so BUILD cannot safely identify an application start script.' };
    }
  }
  const scripts = manifest?.scripts ?? {};
  const dependencies = { ...manifest?.dependencies, ...manifest?.devDependencies };
  const devCommand = typeof scripts.dev === 'string' ? 'npm run dev' : null;
  const startCommand = typeof scripts.start === 'string' ? 'npm start' : null;

  if (dependencies.next) return {
    framework: 'nextjs', runtime: 'node', command: devCommand ?? startCommand, status: devCommand || startCommand ? 'detected' : 'unsupported',
    explanation: devCommand || startCommand ? 'Next.js dependency and an application start script were detected.' : 'Next.js is present but package.json has no dev or start script.',
  };
  if (dependencies.vite) return {
    framework: 'vite', runtime: 'node', command: devCommand ?? startCommand, status: devCommand || startCommand ? 'detected' : 'unsupported',
    explanation: devCommand || startCommand ? 'Vite dependency and an application start script were detected.' : 'Vite is present but package.json has no dev or start script.',
  };
  if (dependencies['react-scripts']) return {
    framework: 'react', runtime: 'node', command: startCommand, status: startCommand ? 'detected' : 'unsupported',
    explanation: startCommand ? 'Create React App scripts were detected.' : 'Create React App is present but package.json has no start script.',
  };
  if (dependencies.express || dependencies.fastify || dependencies.koa || dependencies.hono) return {
    framework: 'node', runtime: 'node', command: startCommand ?? devCommand, status: startCommand || devCommand ? 'detected' : 'unsupported',
    explanation: startCommand || devCommand ? 'A supported Node web-server dependency and start script were detected.' : 'A Node web-server dependency is present but no start script was found.',
  };
  if (paths.has('index.html')) return {
    framework: 'static', runtime: 'static', command: null, status: 'detected',
    explanation: 'An index.html entry point was detected. Static previews still require the isolated preview gateway.',
  };
  if (packageFile) return {
    framework: 'unsupported', runtime: 'unsupported', command: null, status: 'unsupported',
    explanation: 'A package manifest exists, but BUILD has no verified preview adapter for its framework.',
  };
  return {
    framework: 'unsupported', runtime: 'unsupported', command: null, status: 'unsupported',
    explanation: 'No supported web application entry point or runtime adapter was detected.',
  };
}

export type BuildRuntimeDiagnostic = {
  severity: 'error';
  source: 'build' | 'runtime' | 'test' | 'execution';
  message: string;
  command: string;
  filePath?: string;
  line?: number;
  column?: number;
  stackTrace: string;
  exitCode: number;
  sessionId: string;
  logId: string;
  occurredAt: string;
};

export function parseBuildRuntimeDiagnostic(log: {
  id: string;
  sessionId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  createdAt: Date | string;
}): BuildRuntimeDiagnostic | null {
  if (log.exitCode === 0 || log.exitCode < 0) return null;
  const output = `${log.stderr}\n${log.stdout}`.trim().slice(0, 16_384);
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const compiler = lines.map(line => {
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*(?:fatal\s+)?error(?:\s+[\w-]+)?:\s*(.*)$/i)
      ?? line.match(/^(.+?):(\d+):(\d+):\s*(?:fatal\s+)?error:\s*(.*)$/i);
    return match ? { filePath: match[1], line: Number(match[2]), column: Number(match[3]), message: match[4] } : null;
  }).find(Boolean);
  const pythonFrame = lines.map(line => line.match(/^File ["'](.+?)["'], line (\d+)/)).find(Boolean);
  const message = compiler?.message || lines.at(-1) || `${log.command} exited with code ${log.exitCode}.`;
  const source = /(?:\brun\s+dev\b|\bstart\b)/i.test(log.command)
    ? 'runtime'
    : /(?:test|pytest|unittest)/i.test(log.command)
      ? 'test'
      : /(?:npm|pnpm|yarn|vite|next|webpack|tsc|mvn|gradle|build)/i.test(log.command) ? 'build' : 'execution';
  return {
    severity: 'error',
    source,
    message: message.slice(0, 1000),
    command: log.command.slice(0, 300),
    ...(compiler ? { filePath: compiler.filePath.slice(0, 240), line: compiler.line, column: compiler.column } :
      pythonFrame ? { filePath: pythonFrame[1].slice(0, 240), line: Number(pythonFrame[2]) } : {}),
    stackTrace: output.slice(-8_192),
    exitCode: log.exitCode,
    sessionId: log.sessionId,
    logId: log.id,
    occurredAt: new Date(log.createdAt).toISOString(),
  };
}
