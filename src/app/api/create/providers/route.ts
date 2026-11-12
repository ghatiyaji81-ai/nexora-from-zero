import { getCreateMediaProviderStatus } from '@/lib/server/create-media-provider';
import { requireCreate } from '@/lib/server/create';
import { jsonResponse } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireCreate(request, 'provider-status');
  if ('response' in gate) return gate.response;
  return jsonResponse({ providers: getCreateMediaProviderStatus() });
}
