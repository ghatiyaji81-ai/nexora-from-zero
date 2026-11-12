import 'server-only';

import type { BuildPreviewFramework } from '@/lib/build-preview';

export type BuildPreviewHandle = {
  providerSessionId: string;
  url: string;
};

export type BuildPreviewStartRequest = {
  previewId: string;
  executionSessionId: string;
  runtime: 'node' | 'static' | 'unsupported';
  framework: BuildPreviewFramework;
  command: string | null;
};

export class BuildPreviewUnavailableError extends Error {
  constructor(message = 'Live preview is unavailable: BUILD has no configured isolated preview gateway. The current Docker provider has no network and exposes no ports.') {
    super(message);
    this.name = 'BuildPreviewUnavailableError';
  }
}

export interface BuildPreviewProvider {
  isConfigured(): boolean;
  checkAvailability(): Promise<boolean>;
  start(input: BuildPreviewStartRequest): Promise<BuildPreviewHandle>;
  restart(providerSessionId: string, input: BuildPreviewStartRequest): Promise<BuildPreviewHandle>;
  stop(providerSessionId: string): Promise<void>;
  reload(providerSessionId: string): Promise<void>;
}

export function createUnavailableBuildPreviewProvider(): BuildPreviewProvider {
  const unavailable = () => { throw new BuildPreviewUnavailableError(); };
  return {
    isConfigured: () => false,
    async checkAvailability() { return false; },
    async start() { return unavailable(); },
    async restart() { return unavailable(); },
    async stop() { return unavailable(); },
    async reload() { return unavailable(); },
  };
}

export function getBuildPreviewProvider() {
  return createUnavailableBuildPreviewProvider();
}
