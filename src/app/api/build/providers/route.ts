import { getThinkConfig } from '@/lib/server/think';
import { requireBuild } from '@/lib/server/build';
import { jsonResponse } from '@/lib/server/http';
import { getBuildExecutionProvider } from '@/lib/server/build-execution-provider';
import { getBuildGitHubProvider } from '@/lib/server/build-github-provider';
import { getBuildPreviewProvider } from '@/lib/server/build-preview-provider';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireBuild(request, 'provider-status');
  if ('response' in gate) return gate.response;
  const think = getThinkConfig();
  const sandbox = getBuildExecutionProvider();
  const github = getBuildGitHubProvider();
  const preview = getBuildPreviewProvider();
  const sandboxAvailable = await sandbox.checkAvailability();
  const previewAvailable = await preview.checkAvailability();
  return jsonResponse({
    think: { configured: think.configured, models: think.models },
    sandbox: { configured: sandboxAvailable, reason: sandboxAvailable ? 'Docker is available for restricted offline sessions.' : 'Execution environment unavailable — enable and configure the isolated Docker provider.' },
    preview: { configured: previewAvailable, reason: previewAvailable ? 'An isolated preview gateway is available.' : 'Live preview is unavailable; no owner-authenticated isolated preview gateway is configured.' },
    github: { configured: github.isConfigured(), reason: github.isConfigured() ? 'GitHub integration is configured.' : 'GitHub integration is unavailable; server-side credential storage is not configured.' },
    deployment: { configured: false, reason: 'No deployment provider is configured.' },
  });
}
