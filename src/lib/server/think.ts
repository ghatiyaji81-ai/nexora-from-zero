import 'server-only';
import { getAuthenticatedContext, type AuthenticatedContext } from '@/lib/server/auth-session';
import { connectToDatabase } from '@/lib/server/db';
import { jsonResponse, requestIsSameOrigin } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/auth-rate-limit';
import type { ThinkAgent } from '@/models/think-conversation';

export const THINK_AGENTS: Record<ThinkAgent, { name: string; description: string; instructions: string; webSearch: boolean }> = {
  general: { name: 'General assistant', description: 'A thoughtful partner for everyday questions.', instructions: 'Be clear, accurate, and useful. Say when you are uncertain.', webSearch: false },
  research: { name: 'Research agent', description: 'Explore a question and cite current sources.', instructions: 'Research the question carefully. Separate sourced facts from inference and cite sources supplied by the search tool.', webSearch: true },
  coding: { name: 'Coding agent', description: 'Reason through code, design, and debugging.', instructions: 'Explain assumptions, show maintainable code, and call out security or correctness tradeoffs. Never claim code was executed.', webSearch: false },
  study: { name: 'Study agent', description: 'Learn a topic with explanations and practice.', instructions: 'Teach step by step, check for misconceptions, and use a short example before increasing complexity.', webSearch: false },
  writing: { name: 'Writing agent', description: 'Shape drafts while preserving the intended voice.', instructions: 'Ask for missing audience or tone only when needed. Preserve the writer’s meaning and avoid inventing facts.', webSearch: false },
  analysis: { name: 'Data analysis agent', description: 'Work through evidence, calculations, and structured findings.', instructions: 'State the data and assumptions used. Distinguish calculated results from interpretation; do not claim to have run code.', webSearch: false },
};

export const DEFAULT_THINK_MODEL = 'gpt-4.1-mini';

export function getThinkConfig() {
  const configured = (process.env.THINK_OPENAI_MODELS ?? process.env.THINK_OPENAI_MODEL ?? DEFAULT_THINK_MODEL)
    .split(',').map(model => model.trim()).filter(Boolean).slice(0, 12);
  const models = [...new Set(configured)];
  return {
    provider: 'openai' as const,
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    models,
    defaultModel: models[0] ?? DEFAULT_THINK_MODEL,
    webSearchConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()) && process.env.THINK_ENABLE_WEB_SEARCH === 'true',
  };
}

export async function requireThink(request: Request, scope: string, limit = 90) {
  const context = await getAuthenticatedContext();
  if (!context) return { response: jsonResponse({ error: 'Sign in to use THINK.' }, 401) };
  if (!requestIsSameOrigin(request) && request.method !== 'GET') {
    return { response: jsonResponse({ error: 'Request origin could not be verified.' }, 403) };
  }
  await connectToDatabase();
  const budget = await consumeRateLimit(request, `think:${scope}`, limit, 60_000, context.user.id);
  if (!budget.allowed) return { response: jsonResponse({ error: 'You are doing that too often. Try again shortly.' }, 429, { 'Retry-After': String(budget.retryAfterSeconds) }) };
  return { context };
}

export function getThinkOwnerId(context: AuthenticatedContext) {
  return context.user.id;
}

export function isThinkAgent(value: unknown): value is ThinkAgent {
  return typeof value === 'string' && value in THINK_AGENTS;
}

export function isThinkModel(value: unknown) {
  return typeof value === 'string' && getThinkConfig().models.includes(value);
}

export function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
