import 'server-only';

export type BuildExecutionTask = 'build' | 'test' | 'lint' | 'typecheck';

export type BuildExecutionResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export interface BuildExecutionProvider {
  isConfigured(): boolean;
  run(task: BuildExecutionTask, projectId: string, signal: AbortSignal): Promise<BuildExecutionResult>;
}

export class BuildExecutionUnavailableError extends Error {
  constructor() {
    super('Execution environment unavailable — configure a sandbox provider.');
    this.name = 'BuildExecutionUnavailableError';
  }
}

export function createUnavailableBuildExecutionProvider(): BuildExecutionProvider {
  return {
    isConfigured: () => false,
    async run() {
      throw new BuildExecutionUnavailableError();
    },
  };
}

export function getBuildExecutionProvider() {
  return createUnavailableBuildExecutionProvider();
}
