import { getThinkConfig } from '@/lib/server/think';
import { requireBuild } from '@/lib/server/build';
import { jsonResponse } from '@/lib/server/http';
import { getBuildExecutionProvider } from '@/lib/server/build-execution-provider';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireBuild(request, 'provider-status');
  if ('response' in gate) return gate.response;
  const think = getThinkConfig();
  const sandbox = getBuildExecutionProvider();
  return jsonResponse({
    think: { configured: think.configured, models: think.models },
    sandbox: { configured: sandbox.isConfigured(), reason: sandbox.isConfigured() ? 'An isolated execution provider is configured.' : 'Execution environment unavailable — configure a sandbox provider.' },
    github: { configured: false, reason: 'GitHub integration is not configured.' },
    deployment: { configured: false, reason: 'No deployment provider is configured.' },
  });
}
