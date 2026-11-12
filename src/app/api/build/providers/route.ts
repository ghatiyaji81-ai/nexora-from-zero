import { getThinkConfig } from '@/lib/server/think';
import { requireBuild } from '@/lib/server/build';
import { jsonResponse } from '@/lib/server/http';
import { getBuildExecutionProvider } from '@/lib/server/build-execution-provider';
import { getBuildGitHubProvider } from '@/lib/server/build-github-provider';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireBuild(request, 'provider-status');
  if ('response' in gate) return gate.response;
  const think = getThinkConfig();
  const sandbox = getBuildExecutionProvider();
  const github = getBuildGitHubProvider();
  const sandboxAvailable = await sandbox.checkAvailability();
  return jsonResponse({
    think: { configured: think.configured, models: think.models },
    sandbox: { configured: sandboxAvailable, reason: sandboxAvailable ? 'Docker is available for restricted offline sessions.' : 'Execution environment unavailable — enable and configure the isolated Docker provider.' },
    github: { configured: github.isConfigured(), reason: github.isConfigured() ? 'GitHub integration is configured.' : 'GitHub integration is unavailable; server-side credential storage is not configured.' },
    deployment: { configured: false, reason: 'No deployment provider is configured.' },
  });
}
