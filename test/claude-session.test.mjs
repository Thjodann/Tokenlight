import test from 'node:test';
import assert from 'node:assert/strict';
import { selectClaudeSession, readClaudeUsage } from '../src/claude-session.mjs';
class SessionError extends Error { constructor(message, code) { super(message); this.code = code; } }
const expired = { accessToken: 'fixture-expired', expiresAt: 1 };
const fresh = { accessToken: 'fixture-fresh', expiresAt: Date.now() + 3600000 };

test('an expired Keychain record cannot mask a renewed fallback session', () => {
  assert.equal(selectClaudeSession(expired, fresh).accessToken, fresh.accessToken);
  assert.equal(selectClaudeSession(fresh, expired).accessToken, fresh.accessToken);
});

test('a credential rotated during a rejected usage request is retried once', async () => {
  let reads = 0; const sent = [];
  const result = await readClaudeUsage({ ErrorType: SessionError, load: async () => ++reads === 1 ? { ...fresh, accessToken: 'fixture-old' } : fresh,
    request: async token => { sent.push(token); if (sent.length === 1) throw new SessionError('denied', 'auth'); return { seven_day: { utilization: 12 } }; } });
  assert.deepEqual(sent, ['fixture-old', fresh.accessToken]);
  assert.equal(result.usage.seven_day.utilization, 12);
});

test('an expired read is checked again for a concurrent Claude renewal', async () => {
  let reads = 0;
  const result = await readClaudeUsage({ ErrorType: SessionError, load: async () => ++reads === 1 ? expired : fresh, request: async () => ({ ok: true }) });
  assert.equal(result.usage.ok, true);
});

test('a genuinely expired or revoked session gives an actionable reconnect error without loops', async () => {
  let requests = 0;
  await assert.rejects(readClaudeUsage({ ErrorType: SessionError, load: async () => expired, request: async () => requests++ }), e => e.code === 'setup' && /Sign in/.test(e.message));
  await assert.rejects(readClaudeUsage({ ErrorType: SessionError, load: async () => fresh, request: async () => { requests++; throw new SessionError('private response', 'auth'); } }), e => e.code === 'setup' && !e.message.includes('private response'));
  assert.equal(requests, 1);
});

test('rate limits and network failures are not retried as token rotation', async () => {
  for (const code of ['rate_limit', 'network']) {
    let reads = 0, requests = 0; const failure = new SessionError('wait', code);
    await assert.rejects(readClaudeUsage({ ErrorType: SessionError, load: async () => { reads++; return fresh; }, request: async () => { requests++; throw failure; } }), e => e === failure);
    assert.equal(reads, 1); assert.equal(requests, 1);
  }
});
