import { safeBuildPath } from '@/lib/build';

export const MAX_BUILD_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
export const BUILD_DOCKER_RESOURCE_POLICY = {
  memory: '1g',
  cpus: '1',
  pids: 128,
  workspaceTmpfsMb: 512,
  tempTmpfsMb: 128,
} as const;

export type ApprovedBuildCommand = {
  args: string[];
  requiresApproval: boolean;
  needsNetwork: boolean;
};

export function parseBuildCommand(input: string): ApprovedBuildCommand | null {
  const command = input.trim();
  if (!command || command.length > 300 || /[\u0000-\u001f\u007f;&|`$<>]/.test(command)) return null;
  const tokens = command.split(/\s+/);
  if (tokens.some(token => token.startsWith('-') && !['-m', '--offline', '--no-index', '--no-audit', '--no-fund', '-r'].includes(token))) return null;

  if (tokens.length === 3 && tokens[0] === 'npm' && tokens[1] === 'run' &&
    ['build', 'test', 'lint', 'typecheck', 'dev'].includes(tokens[2])) {
    return { args: ['npm', 'run', tokens[2]], requiresApproval: true, needsNetwork: false };
  }
  if ((tokens.length === 2 || tokens.length === 3) && tokens[0] === 'npm' && ['install', 'ci'].includes(tokens[1]) &&
    (tokens.length === 2 || tokens[2] === '--offline')) {
    return { args: ['npm', tokens[1], '--offline', '--no-audit', '--no-fund'], requiresApproval: true, needsNetwork: false };
  }
  if (tokens.length === 2 && /^python(?:3)?$/.test(tokens[0]) && safeBuildPath(tokens[1])) {
    return { args: ['python3', tokens[1]], requiresApproval: true, needsNetwork: false };
  }
  if (tokens.length === 2 && /^python(?:3)?$/.test(tokens[0]) && ['-m', '-c'].includes(tokens[1])) return null;
  if (tokens.length === 3 && /^python(?:3)?$/.test(tokens[0]) && tokens[1] === '-m' &&
    ['pytest', 'unittest'].includes(tokens[2])) {
    return { args: ['python3', '-m', tokens[2]], requiresApproval: true, needsNetwork: false };
  }
  if (tokens.length === 2 && tokens[0] === 'mvn' && ['test', 'package'].includes(tokens[1])) {
    return { args: ['mvn', '--offline', tokens[1]], requiresApproval: true, needsNetwork: false };
  }
  if (tokens.length === 2 && tokens[0] === 'gradle' && ['test', 'build'].includes(tokens[1])) {
    return { args: ['gradle', '--offline', tokens[1]], requiresApproval: true, needsNetwork: false };
  }
  if (tokens.length === 2 && tokens[0] === 'pip' && tokens[1] === 'list') {
    return { args: ['python3', '-m', 'pip', 'list', '--disable-pip-version-check'], requiresApproval: true, needsNetwork: false };
  }
  if (tokens.length === 4 && tokens[0] === 'pip' && tokens[1] === 'install' && tokens[2] === '--no-index' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}(?:==[A-Za-z0-9.*+!-]{1,60})?$/.test(tokens[3])) {
    return { args: ['python3', '-m', 'pip', 'install', '--no-index', tokens[3]], requiresApproval: true, needsNetwork: false };
  }
  if (tokens.length === 5 && tokens[0] === 'pip' && tokens[1] === 'install' && tokens[2] === '--no-index' &&
    tokens[3] === '-r' && safeBuildPath(tokens[4])) {
    return { args: ['python3', '-m', 'pip', 'install', '--no-index', '-r', tokens[4]], requiresApproval: true, needsNetwork: false };
  }
  return null;
}

export function detectBuildRuntime(paths: string[]): 'node' | 'python' | 'java' | 'native' {
  if (paths.some(path => /(^|\/)(pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?)$/.test(path) || /\.java$/i.test(path))) return 'java';
  if (paths.some(path => /(^|\/)(requirements\.txt|pyproject\.toml|Pipfile)$/.test(path) || /\.py$/i.test(path))) return 'python';
  if (paths.some(path => /\.(c|cc|cpp|h|hpp)$/i.test(path))) return 'native';
  return 'node';
}

export function isValidBuildBranch(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/.test(value) &&
    !value.includes('..') && !value.includes('//') && !value.includes('@{') &&
    !value.endsWith('/') && !value.endsWith('.') && !value.endsWith('.lock');
}
