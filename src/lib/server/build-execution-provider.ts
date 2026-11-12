import 'server-only';
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { safeBuildPath } from '@/lib/build';
import { BUILD_DOCKER_RESOURCE_POLICY, MAX_BUILD_COMMAND_TIMEOUT_MS } from '@/lib/build-execution-policy';

export type BuildRuntime = 'node' | 'python' | 'java' | 'native';
export type BuildExecutionResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};
export type BuildExecutionFile = { path: string; content: string };

export class BuildExecutionUnavailableError extends Error {
  constructor(message = 'Execution environment unavailable — configure an isolated Docker provider.') {
    super(message);
    this.name = 'BuildExecutionUnavailableError';
  }
}

export class BuildExecutionTimeoutError extends Error {
  constructor() {
    super('The command exceeded its execution time limit; the isolated session was stopped.');
    this.name = 'BuildExecutionTimeoutError';
  }
}

export interface BuildExecutionProvider {
  isConfigured(): boolean;
  checkAvailability(): Promise<boolean>;
  start(sessionId: string, runtime: BuildRuntime, files: BuildExecutionFile[]): Promise<string>;
  run(containerId: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<BuildExecutionResult>;
  exportWorkspace(containerId: string): Promise<BuildExecutionFile[]>;
  stop(containerId: string): Promise<void>;
  remove(containerId: string): Promise<void>;
}

type DockerResult = { exitCode: number; stdout: string; stderr: string };
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_WORKSPACE_BYTES = 10 * 1024 * 1024;
const MAX_WORKSPACE_FILES = 500;

function boundedOutput(value: string) {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.byteLength <= MAX_OUTPUT_BYTES) return value;
  const marker = '\n[output truncated]';
  return `${buffer.subarray(0, MAX_OUTPUT_BYTES - Buffer.byteLength(marker)).toString('utf8')}${marker}`;
}

function dockerEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '', NODE_ENV: 'production' };
  for (const key of ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'USERPROFILE', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

function runDocker(args: string[], timeoutMs = 20_000, signal?: AbortSignal): Promise<DockerResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Execution cancelled.'));
      return;
    }
    let child;
    try {
      child = spawn(process.env.BUILD_DOCKER_COMMAND || 'docker', args, {
        env: dockerEnvironment(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(new BuildExecutionUnavailableError(error instanceof Error ? error.message : undefined));
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let totalOutput = 0;
    let timedOut = false;
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      if (totalOutput >= MAX_OUTPUT_BYTES * 2) return;
      const bounded = chunk.subarray(0, MAX_OUTPUT_BYTES * 2 - totalOutput);
      target.push(bounded);
      totalOutput += bounded.byteLength;
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, Math.min(timeoutMs, MAX_BUILD_COMMAND_TIMEOUT_MS));
    const onAbort = () => child.kill();
    signal?.addEventListener('abort', onAbort, { once: true });
    child.once('error', error => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new BuildExecutionUnavailableError(error.message));
    });
    child.once('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (timedOut) {
        reject(new BuildExecutionTimeoutError());
        return;
      }
      if (signal?.aborted) {
        reject(signal.reason ?? new Error('Execution cancelled.'));
        return;
      }
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

const RUNTIME_IMAGES: Record<BuildRuntime, string> = {
  node: 'node:22-bookworm',
  python: 'python:3.13-bookworm',
  java: 'maven:3.9-eclipse-temurin-21',
  native: 'gcc:14',
};

function containerName(sessionId: string) {
  return `nexora-build-${sessionId.replace(/[^a-f0-9]/gi, '').toLowerCase()}`;
}

export class DockerBuildExecutionProvider implements BuildExecutionProvider {
  isConfigured() {
    return process.env.BUILD_DOCKER_ENABLED === 'true';
  }

  async checkAvailability() {
    if (!this.isConfigured()) return false;
    try {
      const result = await runDocker(['info', '--format', '{{.ServerVersion}}'], 5_000);
      return result.exitCode === 0 && result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async start(sessionId: string, runtime: BuildRuntime, files: BuildExecutionFile[]) {
    if (!this.isConfigured() || !await this.checkAvailability()) throw new BuildExecutionUnavailableError();
    if (!files.length || files.length > MAX_WORKSPACE_FILES) throw new Error('The project exceeds the isolated workspace file limit.');
    let totalBytes = 0;
    const paths = new Set<string>();
    for (const file of files) {
      const safePath = safeBuildPath(file.path);
      const size = Buffer.byteLength(file.content, 'utf8');
      if (!safePath || paths.has(safePath.toLowerCase()) || size > 256 * 1024) throw new Error('The project contains an invalid or oversized source file.');
      paths.add(safePath.toLowerCase());
      totalBytes += size;
      if (totalBytes > MAX_WORKSPACE_BYTES) throw new Error('The project exceeds the isolated workspace size limit.');
    }

    const name = containerName(sessionId);
    const image = process.env[`BUILD_DOCKER_${runtime.toUpperCase()}_IMAGE`] || RUNTIME_IMAGES[runtime];
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,180}$/.test(image)) throw new Error('The configured sandbox image reference is invalid.');
    const inspected = await runDocker(['image', 'inspect', image, '--format', '{{.Id}}']);
    if (inspected.exitCode !== 0) throw new BuildExecutionUnavailableError(`Required sandbox image ${image} is not present locally; automatic image pulls are disabled.`);

    const stage = await mkdtemp(path.join(os.tmpdir(), 'nexora-build-'));
    try {
      for (const file of files) {
        const relative = safeBuildPath(file.path);
        if (!relative) throw new Error('The project contains an unsafe source path.');
        const destination = path.join(stage, ...relative.split('/'));
        await mkdir(path.dirname(destination), { recursive: true, mode: 0o777 });
        await writeFile(destination, file.content, { mode: 0o666, flag: 'wx' });
      }
      const created = await runDocker([
        'create', '--name', name, '--label', 'nexora.build.session=true',
        '--network', 'none', '--read-only', '--user', '1000:1000',
        '--pids-limit', String(BUILD_DOCKER_RESOURCE_POLICY.pids),
        '--memory', BUILD_DOCKER_RESOURCE_POLICY.memory, '--cpus', BUILD_DOCKER_RESOURCE_POLICY.cpus,
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--tmpfs', `/tmp:rw,nosuid,nodev,size=${BUILD_DOCKER_RESOURCE_POLICY.tempTmpfsMb}m`,
        '--tmpfs', `/workspace:rw,nosuid,nodev,size=${BUILD_DOCKER_RESOURCE_POLICY.workspaceTmpfsMb}m,mode=0777`,
        '--workdir', '/workspace', '--entrypoint', '/bin/sh', image,
        '-c', 'while :; do sleep 3600; done',
      ]);
      if (created.exitCode !== 0) throw new BuildExecutionUnavailableError('Docker could not create the isolated project session.');
      const started = await runDocker(['start', name]);
      if (started.exitCode !== 0) throw new BuildExecutionUnavailableError('Docker could not start the isolated project session.');
      const copied = await runDocker(['cp', `${stage}${path.sep}.`, `${name}:/workspace`], 60_000);
      if (copied.exitCode !== 0) throw new BuildExecutionUnavailableError('Docker could not load project files into the isolated session.');
      const permissions = await runDocker(['exec', '--user', '0:0', name, 'chmod', '-R', 'a+rwX', '/workspace']);
      if (permissions.exitCode !== 0) throw new BuildExecutionUnavailableError('Docker could not set project workspace permissions.');
      return name;
    } catch (error) {
      await this.remove(name).catch(() => undefined);
      throw error;
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }

  async run(containerId: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<BuildExecutionResult> {
    if (!/^nexora-build-[a-f0-9]{24}$/.test(containerId) || !args.length || args.some(arg => arg.includes('\0'))) {
      throw new Error('The isolated command request is invalid.');
    }
    const startedAt = Date.now();
    try {
      const result = await runDocker(['exec', '--workdir', '/workspace', '--env', 'HOME=/tmp', containerId, ...args], timeoutMs, signal);
      return { ...result, stdout: boundedOutput(result.stdout), stderr: boundedOutput(result.stderr), durationMs: Date.now() - startedAt };
    } catch (error) {
      if (error instanceof BuildExecutionTimeoutError || signal?.aborted) await this.remove(containerId);
      throw error;
    }
  }

  async exportWorkspace(containerId: string) {
    if (!/^nexora-build-[a-f0-9]{24}$/.test(containerId)) throw new Error('The isolated session is invalid.');
    const usage = await runDocker([
      'exec', containerId, '/bin/sh', '-c', 'du -sk /workspace; find /workspace -type f | wc -l',
    ], 15_000);
    const [sizeLine, countLine] = usage.stdout.trim().split(/\r?\n/);
    const workspaceKb = Number(sizeLine?.split(/\s+/, 1)[0]);
    const workspaceFiles = Number(countLine?.trim());
    if (usage.exitCode !== 0 || !Number.isFinite(workspaceKb) || !Number.isFinite(workspaceFiles) ||
      workspaceKb > MAX_WORKSPACE_BYTES / 1024 || workspaceFiles > MAX_WORKSPACE_FILES) {
      throw new Error('The isolated workspace exceeds safe synchronization limits.');
    }
    const stage = await mkdtemp(path.join(os.tmpdir(), 'nexora-build-export-'));
    try {
      const copied = await runDocker(['cp', `${containerId}:/workspace/.`, stage], 60_000);
      if (copied.exitCode !== 0) throw new BuildExecutionUnavailableError('The isolated project files could not be read.');
      const files: BuildExecutionFile[] = [];
      let totalBytes = 0;
      async function walk(directory: string, prefix: string) {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (['.git', 'node_modules', '.next', '.venv', '__pycache__', 'coverage', 'dist', 'build'].includes(entry.name)) continue;
          const entryPath = path.join(directory, entry.name);
          const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
          const safePath = safeBuildPath(relative);
          if (!safePath) throw new Error(`The isolated workspace contains an unsafe path: ${relative}`);
          const metadata = await lstat(entryPath);
          if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
            throw new Error(`The isolated workspace contains a link or unsupported file: ${safePath}`);
          }
          if (metadata.isDirectory()) {
            await walk(entryPath, safePath);
            continue;
          }
          if (metadata.size > 256 * 1024 || files.length >= MAX_WORKSPACE_FILES) {
            throw new Error('The isolated workspace exceeds BUILD file limits.');
          }
          const bytes = await readFile(entryPath);
          const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          if (content.includes('\0')) throw new Error(`Binary files cannot be synchronized: ${safePath}`);
          totalBytes += bytes.byteLength;
          if (totalBytes > MAX_WORKSPACE_BYTES) throw new Error('The isolated workspace exceeds BUILD size limits.');
          files.push({ path: safePath, content });
        }
      }
      await walk(stage, '');
      return files;
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }

  async stop(containerId: string) {
    if (!/^nexora-build-[a-f0-9]{24}$/.test(containerId)) return;
    const result = await runDocker(['stop', '--time', '2', containerId], 10_000);
    if (result.exitCode !== 0 && !/no such container/i.test(result.stderr)) {
      throw new BuildExecutionUnavailableError('Docker could not stop the isolated session.');
    }
  }

  async remove(containerId: string) {
    if (!/^nexora-build-[a-f0-9]{24}$/.test(containerId)) return;
    await this.stop(containerId);
    const result = await runDocker(['rm', '--force', containerId], 10_000);
    if (result.exitCode !== 0 && !/no such container/i.test(result.stderr)) {
      throw new BuildExecutionUnavailableError('Docker could not remove the isolated session.');
    }
  }
}

export function createUnavailableBuildExecutionProvider(): BuildExecutionProvider {
  return {
    isConfigured: () => false,
    async checkAvailability() { return false; },
    async start() { throw new BuildExecutionUnavailableError(); },
    async run() { throw new BuildExecutionUnavailableError(); },
    async exportWorkspace() { throw new BuildExecutionUnavailableError(); },
    async stop() { throw new BuildExecutionUnavailableError(); },
    async remove() { throw new BuildExecutionUnavailableError(); },
  };
}

export function getBuildExecutionProvider(): BuildExecutionProvider {
  return new DockerBuildExecutionProvider();
}

export function clipBuildOutput(value: string) {
  return boundedOutput(value);
}
