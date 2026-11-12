import 'server-only';

export type BuildGitHubRepository = {
  id: string;
  fullName: string;
  defaultBranch: string;
};

export type BuildGitHubResult = {
  status: string;
  message: string;
};

export interface BuildGitHubProvider {
  isConfigured(): boolean;
  listRepositories(): Promise<BuildGitHubRepository[]>;
  connectRepository(projectId: string, repositoryId: string): Promise<BuildGitHubResult>;
  fetch(projectId: string): Promise<BuildGitHubResult>;
  pull(projectId: string, branch: string): Promise<BuildGitHubResult>;
  push(projectId: string, branch: string, approved: boolean): Promise<BuildGitHubResult>;
  getRemoteStatus(projectId: string): Promise<BuildGitHubResult>;
}

export class BuildGitHubUnavailableError extends Error {
  constructor() {
    super('GitHub integration unavailable — no server-side GitHub provider or credential storage is configured.');
    this.name = 'BuildGitHubUnavailableError';
  }
}

export function createUnavailableBuildGitHubProvider(): BuildGitHubProvider {
  return {
    isConfigured: () => false,
    async listRepositories() { throw new BuildGitHubUnavailableError(); },
    async connectRepository() { throw new BuildGitHubUnavailableError(); },
    async fetch() { throw new BuildGitHubUnavailableError(); },
    async pull() { throw new BuildGitHubUnavailableError(); },
    async push() { throw new BuildGitHubUnavailableError(); },
    async getRemoteStatus() { throw new BuildGitHubUnavailableError(); },
  };
}

export function getBuildGitHubProvider() {
  return createUnavailableBuildGitHubProvider();
}
