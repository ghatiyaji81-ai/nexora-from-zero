import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpenAIProvider, ProviderRequestError } from '../src/lib/server/think-provider';

const signal = () => new AbortController().signal;

function sseResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`event: ${typeof event === 'object' && event && 'type' in event ? event.type : 'message'}\ndata: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

test('OpenAI Responses adapter sends the configured model and streams deltas and source citations', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const provider = createOpenAIProvider({ apiKey: 'server-only-test-secret', webSearch: true, fetcher: async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return sseResponse([
      { type: 'response.created', response: { id: 'resp_test' } },
      { type: 'response.output_text.delta', delta: 'A streamed answer.' },
      { type: 'response.output_text.annotation.added', annotation: { type: 'url_citation', url: 'https://example.org/source', title: 'Source' } },
      { type: 'response.output_item.added', item: { type: 'web_search_call' } },
      { type: 'response.output_item.done', item: { type: 'web_search_call' } },
      { type: 'response.completed', response: { id: 'resp_test' } },
    ]);
  } });
  const events = [];
  for await (const event of provider.stream({ model: 'gpt-configured', agent: 'research', messages: [{ role: 'user', content: 'Find sources' }], signal: signal() })) events.push(event);
  assert.equal(requestUrl, 'https://api.openai.com/v1/responses');
  const headers = new Headers(requestInit?.headers);
  assert.equal(headers.get('authorization'), 'Bearer server-only-test-secret');
  assert.equal(headers.get('accept'), 'text/event-stream');
  const payload = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
  assert.equal(payload.model, 'gpt-configured');
  assert.equal(payload.stream, true);
  assert.equal(payload.store, false);
  assert.deepEqual(payload.tools, [{ type: 'web_search' }]);
  assert.equal(JSON.stringify(events).includes('server-only-test-secret'), false);
  assert.deepEqual(events, [
    { type: 'delta', text: 'A streamed answer.' },
    { type: 'citation', citation: { url: 'https://example.org/source', title: 'Source' } },
    { type: 'tool', name: 'web_search', status: 'started' },
    { type: 'tool', name: 'web_search', status: 'completed' },
  ]);
});

test('provider retries a transient rate limit and returns a safe typed error for rejected models', async () => {
  let calls = 0;
  const retrying = createOpenAIProvider({ apiKey: 'secret', fetcher: async () => {
    calls += 1;
    return calls === 1 ? new Response('{}', { status: 429 }) : sseResponse([{ type: 'response.output_text.delta', delta: 'ok' }, { type: 'response.completed' }]);
  } });
  const output: string[] = [];
  for await (const event of retrying.stream({ model: 'model', agent: 'general', messages: [{ role: 'user', content: 'hi' }], signal: signal() })) if (event.type === 'delta') output.push(event.text);
  assert.equal(calls, 2);
  assert.deepEqual(output, ['ok']);

  const rejecting = createOpenAIProvider({ apiKey: 'secret', fetcher: async () => new Response('{"error":"private provider detail"}', { status: 400 }) });
  await assert.rejects(async () => {
    for await (const _event of rejecting.stream({ model: 'unavailable', agent: 'general', messages: [{ role: 'user', content: 'hi' }], signal: signal() })) { /* no output expected */ }
  }, (error: unknown) => error instanceof ProviderRequestError && error.statusCode === 400 && !error.message.includes('private provider detail'));
});

test('provider reports incomplete streams instead of treating partial text as a final answer', async () => {
  const provider = createOpenAIProvider({ apiKey: 'secret', fetcher: async () => sseResponse([{ type: 'response.output_text.delta', delta: 'partial' }]) });
  await assert.rejects(async () => {
    for await (const _event of provider.stream({ model: 'model', agent: 'general', messages: [{ role: 'user', content: 'hi' }], signal: signal() })) { /* stream must not silently succeed */ }
  }, /ended the response before it was complete/);
});

test('provider parses CRLF-delimited SSE frames', async () => {
  const provider = createOpenAIProvider({ apiKey: 'secret', fetcher: async () => new Response(
    'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"CRLF works"}\r\n\r\nevent: response.completed\r\ndata: {"type":"response.completed"}\r\n\r\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  ) });
  const output: string[] = [];
  for await (const event of provider.stream({ model: 'model', agent: 'general', messages: [{ role: 'user', content: 'hi' }], signal: signal() })) {
    if (event.type === 'delta') output.push(event.text);
  }
  assert.deepEqual(output, ['CRLF works']);
});

test('provider does not retry timed-out requests', async () => {
  let calls = 0;
  const provider = createOpenAIProvider({ apiKey: 'secret', fetcher: async () => {
    calls += 1;
    throw new DOMException('request timed out', 'TimeoutError');
  } });
  await assert.rejects(async () => {
    for await (const _event of provider.stream({ model: 'model', agent: 'general', messages: [{ role: 'user', content: 'hi' }], signal: signal() })) { /* timeout must fail explicitly */ }
  }, (error: unknown) => error instanceof ProviderRequestError && error.statusCode === 504);
  assert.equal(calls, 1);
});
