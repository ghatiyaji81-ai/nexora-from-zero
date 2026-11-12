import { getThinkConfig } from '@/lib/server/think';
import { jsonResponse } from '@/lib/server/http';
import { requireDiscover } from '@/lib/server/discover';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireDiscover(request, 'providers');
  if ('response' in gate) return gate.response;
  const think = getThinkConfig();
  return jsonResponse({
    providers: {
      localDocuments: { configured: true, description: 'Private THINK documents can be searched locally.' },
      think: { configured: think.configured, description: think.configured ? 'THINK can analyze selected documents.' : 'Configure THINK on the server to enable AI analysis.' },
      webSearch: { configured: think.webSearchConfigured, description: think.webSearchConfigured ? 'THINK research uses its configured web-search tool.' : 'Public web search is unavailable until THINK web search is configured.' },
      news: { configured: false, description: 'No separate news-search provider is configured.' },
      academic: { configured: false, description: 'No academic-search provider is configured.' },
    },
  });
}
