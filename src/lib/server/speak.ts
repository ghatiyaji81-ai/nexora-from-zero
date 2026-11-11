import 'server-only';
import { jsonResponse } from '@/lib/server/http';
import { requireThink } from '@/lib/server/think';

type ThinkGate = Awaited<ReturnType<typeof requireThink>>;

export async function requireSpeak(request: Request, scope: string, limit = 90): Promise<ThinkGate> {
  const gate = await requireThink(request, `speak:${scope}`, limit);
  if ('response' in gate && gate.response?.status === 401) {
    return { response: jsonResponse({ error: 'Sign in to use SPEAK.' }, 401) };
  }
  return gate;
}
