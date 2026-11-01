import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProvider, fetchJSON, loadCredentials } from '../src/providers.mjs';
const response = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('the saved OPEN_AI_ADMIN_KEY takes priority over an ordinary inference key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tokenlight-credential-test-'));
  const names = ['OPENAI_ADMIN_KEY', 'OPENAI_ADMIN_API_KEY', 'OPEN_AI_ADMIN_KEY', 'OPENAI_API_KEY'];
  const inherited = new Map(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    const file = join(dir, 'secrets.env');
    await writeFile(file, 'OPENAI_API_KEY=fixture-inference-key\nOPEN_AI_ADMIN_KEY=fixture-reporting-key\n');
    const credentials = await loadCredentials(file);
    assert.equal(credentials.openai, 'fixture-reporting-key');
  } finally {
    for (const [name, value] of inherited) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('OpenAI follows pagination and combines embeddings with completions', async () => {
  const original = globalThis.fetch, requests = [];
  globalThis.fetch = async url => {
    const u = new URL(url); requests.push(u);
    if (u.pathname.endsWith('/embeddings')) return response({ data: [{ start_time: Date.UTC(2026, 9, 1) / 1000, results: [{ input_tokens: 50 }] }], has_more: false });
    return response({ data: [{ start_time: Date.UTC(2026, 9, u.searchParams.has('page') ? 2 : 1) / 1000, results: [{ input_tokens: 100, input_cached_tokens: 40, output_tokens: 20 }] }], has_more: !u.searchParams.has('page'), next_page: 'second' });
  };
  try { const v = await readProvider('openai', '2026-10', { credentials: { openai: 'test-credential' } }); assert.equal(v.monthly, 290); assert.equal(requests.length, 3); assert.equal(v.breakdown.cache, 80); }
  finally { globalThis.fetch = original; }
});
test('truncated pagination never publishes an apparently complete total', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response({ data: [], has_more: true, next_page: null });
  try { await assert.rejects(readProvider('openai', '2026-10', { credentials: { openai: 'test-credential' } }), e => e.code === 'coverage'); }
  finally { globalThis.fetch = original; }
});
test('Anthropic uses its current analytics schema and token categories', async () => {
  const original = globalThis.fetch; let captured;
  globalThis.fetch = async url => { captured = new URL(url); return response({ data: [{ starting_at: '2026-10-02T00:00:00Z', usage: { uncached_input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation: { ephemeral_5m_input_tokens: 4, ephemeral_1h_input_tokens: 5 } } }], has_more: false, data_refreshed_at: '2026-10-31T12:00:00Z' }); };
  try { const value = await readProvider('anthropic', '2026-10', { credentials: { anthropic: 'test-credential' } }); assert.equal(value.monthly, 15); assert.equal(captured.searchParams.get('time_bucket_width'), '1d'); assert.equal(captured.searchParams.get('bucket_width'), null); assert.equal(value.asOf, '2026-10-31T12:00:00Z'); }
  finally { globalThis.fetch = original; }
});
test('unauthorized usage requests give a setup action without logging server text', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('sensitive server detail', { status: 403 });
  try { await assert.rejects(readProvider('openai', '2026-10', { credentials: { openai: 'test-credential' } }), e => e.code === 'setup' && e.message.includes('OPENAI_ADMIN_KEY') && !e.message.includes('sensitive')); }
  finally { globalThis.fetch = original; }
});
test('provider retry-after sets a finite cooldown', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 429, headers: { 'retry-after': '120' } });
  try { await assert.rejects(fetchJSON('https://example.test'), e => e.code === 'rate_limit' && e.retryAt >= Date.now() + 119000); }
  finally { globalThis.fetch = original; }
});
